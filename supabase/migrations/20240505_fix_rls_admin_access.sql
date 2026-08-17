-- ============================================================
-- MIGRATION: 20240505_fix_rls_admin_access.sql
-- Descrição: 
--   Garante que usuários com nível 'ADM', 'DEV' ou 'SUP'
--   tenham acesso total (SELECT, INSERT, UPDATE, DELETE)
--   em todas as tabelas principais, independente do owner_id.
-- ============================================================

-- Habilitar RLS em todas as tabelas (caso não estejam)
ALTER TABLE atas ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_ata ENABLE ROW LEVEL SECURITY;
ALTER TABLE entidades ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para a tabela ATAS
DROP POLICY IF EXISTS "Admins possuem acesso total às atas" ON atas;
CREATE POLICY "Admins possuem acesso total às atas" ON atas
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (nivel IN ('ADM', 'DEV', 'SUP'))
    )
);

DROP POLICY IF EXISTS "Usuários podem ver suas próprias atas" ON atas;
CREATE POLICY "Usuários podem ver suas próprias atas" ON atas
FOR SELECT USING (auth.uid() = owner_id);

-- 2. Políticas para a tabela NOTAS (Empenhos)
DROP POLICY IF EXISTS "Admins possuem acesso total às notas" ON notas;
CREATE POLICY "Admins possuem acesso total às notas" ON notas
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (nivel IN ('ADM', 'DEV', 'SUP'))
    )
);

-- 3. Políticas para a tabela ITENS
DROP POLICY IF EXISTS "Admins possuem acesso total aos itens" ON itens;
CREATE POLICY "Admins possuem acesso total aos itens" ON itens
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (nivel IN ('ADM', 'DEV', 'SUP'))
    )
);

-- 4. Políticas para a tabela ITENS_ATA
DROP POLICY IF EXISTS "Admins possuem acesso total aos itens_ata" ON itens_ata;
CREATE POLICY "Admins possuem acesso total aos itens_ata" ON itens_ata
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (nivel IN ('ADM', 'DEV', 'SUP'))
    )
);

-- 5. Políticas para a tabela ENTIDADES
DROP POLICY IF EXISTS "Admins possuem acesso total às entidades" ON entidades;
CREATE POLICY "Admins possuem acesso total às entidades" ON entidades
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND (nivel IN ('ADM', 'DEV', 'SUP'))
    )
);
