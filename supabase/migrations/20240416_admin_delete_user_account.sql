-- ============================================================
-- Função: admin_delete_user_account
-- Descrição:
--   Apaga permanentemente uma conta de usuário do sistema.
--   Pode ser chamada de duas formas:
--     1. Auto-exclusão: qualquer usuário pode excluir a própria conta
--     2. Exclusão por admin: ADM/DEV podem excluir conta de outro usuário
--
--   Ao apagar, anonimiza APENAS os logs daquele usuário (filtra por
--   user_id UUID, nunca por e-mail), garantindo que:
--
--   1. O e-mail é censurado parcialmente nos logs históricos:
--      "joao@gmail.com"  →  "jo***@gmail.com"
--
--   2. O nome do usuário é MANTIDO (rastreabilidade das ações)
--
--   3. O CPF é REMOVIDO do campo 'details' (único dado sensível)
--
--   4. Se a pessoa se cadastrar novamente com o mesmo e-mail,
--      não há conflito: o novo cadastro recebe um novo UUID,
--      e seus logs futuros NÃO são anonimizados, a menos que
--      a conta seja excluída novamente.
--
--   Requer que o chamador seja ADM ou DEV.
-- ============================================================
CREATE OR REPLACE FUNCTION admin_delete_user_account(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_nivel   TEXT;
    target_email   TEXT;
    censored_email TEXT;
BEGIN
    -- 1. Verificar autorização:
    --    a) Auto-exclusão → sempre permitida (target = chamador)
    --    b) Exclusão de outro usuário → requer ADM ou DEV
    IF target_user_id != auth.uid() THEN
        SELECT nivel INTO caller_nivel FROM profiles WHERE id = auth.uid();
        IF caller_nivel NOT IN ('ADM', 'DEV') THEN
            RETURN jsonb_build_object('success', false, 'message', 'Acesso negado: você só pode excluir sua própria conta.');
        END IF;
    END IF;

    -- 3. Capturar e-mail antes da exclusão
    SELECT email INTO target_email FROM profiles WHERE id = target_user_id;
    IF target_email IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Usuário não encontrado.');
    END IF;

    -- Pré-calcular o e-mail censurado: "joao@gmail.com" → "jo***@gmail.com"
    censored_email := LEFT(target_email, 2) || '***@' || SPLIT_PART(target_email, '@', 2);

    -- 4. Anonimizar logs históricos SOMENTE desta conta (filtra por UUID).
    --    → Logs de um eventual recadastro com o mesmo e-mail NÃO são afetados
    --      pois o novo cadastro terá um user_id diferente.
    UPDATE audit_logs
    SET
        user_email = censored_email,
        details    = CASE
                        WHEN details ? 'cpf' THEN details - 'cpf'
                        ELSE details
                     END
    WHERE user_id = target_user_id;

    -- 5. Remover perfil da tabela public.profiles
    DELETE FROM profiles WHERE id = target_user_id;

    -- 6. Remover conta de autenticação (auth.users)
    -- Requer SECURITY DEFINER com acesso ao schema auth.
    -- Após esta exclusão, o e-mail fica livre para novo cadastro.
    DELETE FROM auth.users WHERE id = target_user_id;

    -- 7. Registrar a ação de deleção (e-mail censurado no registro também)
    INSERT INTO audit_logs (action, table_name, record_id, details, user_id, user_email)
    VALUES (
        'DELETE_ACCOUNT',
        'profiles',
        target_user_id::TEXT,
        jsonb_build_object(
            'deleted_email', censored_email,  -- e-mail censurado, não o original
            'deleted_by',    auth.uid()
        ),
        auth.uid(),
        (SELECT email FROM profiles WHERE id = auth.uid())
    );

    RETURN jsonb_build_object('success', true, 'message', 'Conta removida com sucesso.');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Revogar acesso público e garantir que apenas usuários autenticados possam chamar
REVOKE ALL ON FUNCTION admin_delete_user_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_user_account(UUID) TO authenticated;
