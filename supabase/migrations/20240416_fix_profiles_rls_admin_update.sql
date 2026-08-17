-- ============================================================
-- MIGRATION: 20240416_fix_profiles_rls_admin_update.sql
-- Problema:
--   Administradores não conseguiam atualizar campos de outros
--   usuários (cargo_id, setor, nivel) porque a tabela profiles
--   não tinha política RLS de UPDATE para admins.
--   O Supabase retornava success silencioso com 0 linhas afetadas.
-- ============================================================

-- Policy: Usuário pode atualizar o próprio perfil
DROP POLICY IF EXISTS "Usuario pode atualizar proprio perfil" ON profiles;
CREATE POLICY "Usuario pode atualizar proprio perfil"
ON profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Policy: ADM e DEV podem atualizar qualquer perfil
DROP POLICY IF EXISTS "Admin pode atualizar qualquer perfil" ON profiles;
CREATE POLICY "Admin pode atualizar qualquer perfil"
ON profiles FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND nivel IN ('ADM', 'DEV')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND nivel IN ('ADM', 'DEV')
    )
);

-- Policy de SELECT (caso não exista): todos os autenticados podem ler profiles
DROP POLICY IF EXISTS "Profiles visiveis para autenticados" ON profiles;
CREATE POLICY "Profiles visiveis para autenticados"
ON profiles FOR SELECT
USING (auth.role() = 'authenticated');