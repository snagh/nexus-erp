-- ============================================================
-- Função: admin_verify_user
-- Descrição:
--   Permite que um administrador (ADM/DEV) confirme manualmente
--   o e-mail de um usuário, ignorando a necessidade de clique
--   no link de confirmação.
--
--   Isso resolve problemas onde o usuário não recebe o e-mail
--   (caixa cheia, spam, etc) sem precisar deletar e recadastrar.
-- ============================================================
CREATE OR REPLACE FUNCTION admin_verify_user(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_nivel   TEXT;
BEGIN
    -- 1. Verificar autorização do chamador
    SELECT nivel INTO caller_nivel FROM profiles WHERE id = auth.uid();
    IF caller_nivel NOT IN ('ADM', 'DEV') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Acesso negado: apenas administradores podem confirmar usuários.');
    END IF;

    -- 2. Atualizar a tabela auth.users para confirmar o e-mail
    --    - email_confirmed_at: data da confirmação
    --    - confirmed_at: data da confirmação
    --    - last_sign_in_at: opcionalmente nulo, mas o importante é o confirmation
    UPDATE auth.users
    SET 
        email_confirmed_at = now(),
        updated_at = now()
    WHERE id = target_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Usuário não encontrado no sistema de autenticação.');
    END IF;

    -- 3. Registrar a ação no log de auditoria
    INSERT INTO audit_logs (action, table_name, record_id, details, user_id, user_email)
    VALUES (
        'VERIFY_USER_MANUAL',
        'profiles',
        target_user_id::TEXT,
        jsonb_build_object(
            'action', 'manual_email_verification',
            'verified_by', auth.uid()
        ),
        auth.uid(),
        (SELECT email FROM profiles WHERE id = auth.uid())
    );

    RETURN jsonb_build_object('success', true, 'message', 'Usuário confirmado com sucesso!');
END;
$$;

-- Revogar acesso público e garantir que apenas usuários autenticados possam chamar
REVOKE ALL ON FUNCTION admin_verify_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_verify_user(UUID) TO authenticated;
