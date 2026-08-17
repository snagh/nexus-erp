-- ============================================================
-- Função: get_user_auth_status
-- Descrição:
--   Retorna o status de confirmação de e-mail de um usuário
--   consultando a tabela auth.users.
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_auth_status(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    is_confirmed BOOLEAN;
    user_email TEXT;
BEGIN
    -- 1. Verificar autorização do chamador (apenas ADM/DEV)
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND nivel IN ('ADM', 'DEV')) THEN
        RETURN jsonb_build_object('error', 'Acesso negado');
    END IF;

    -- 2. Buscar status
    SELECT 
        email,
        (email_confirmed_at IS NOT NULL) INTO user_email, is_confirmed
    FROM auth.users
    WHERE id = target_user_id;

    IF user_email IS NULL THEN
        RETURN jsonb_build_object('error', 'Usuário não encontrado');
    END IF;

    RETURN jsonb_build_object(
        'email', user_email,
        'is_confirmed', is_confirmed
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_auth_status(UUID) TO authenticated;
