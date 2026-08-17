-- MIGRATION: 20240409_update_pedidos_compra_sla.sql
-- Description: Adiciona controle de SLA e atribuição ao setor de compras, e nível DEV aos perfis.

-- 1. ADICIONAR NÍVEL 'DEV' AO ENUM EXISTENTE
-- Nota: Enums no Postgres não podem ser alterados facilmente com ALTER TYPE ADD VALUE dentro de transações em algumas versões.
-- Usaremos um bloco DO para garantir compatibilidade.
DO $$ 
BEGIN
    ALTER TYPE user_nivel ADD VALUE 'DEV';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. ATUALIZAR TABELA DE PEDIDOS DE COMPRA
ALTER TABLE pedidos_compra
ADD COLUMN IF NOT EXISTS prazo_limite TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id);

-- 3. INDEX PARA PERFORMANCE DE SLA
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_sla ON pedidos_compra(prazo_limite, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_assignment ON pedidos_compra(assigned_to);

-- 4. COMENTÁRIOS PARA AUDITORIA
COMMENT ON COLUMN pedidos_compra.prazo_limite IS 'Data e hora limite para a conclusão da compra (SLA).';
COMMENT ON COLUMN pedidos_compra.assigned_to IS 'ID do Comprador responsável pela solicitação.';
