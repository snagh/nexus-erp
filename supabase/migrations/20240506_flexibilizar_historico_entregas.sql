-- ============================================================
-- MIGRATION: 20240506_flexibilizar_historico_entregas.sql
-- Descrição:
--   Permite que registros de entrega (baixas) existam sem um
--   vínculo obrigatório com um item de empenho (item_id),
--   desde que estejam vinculados diretamente a um item de ATA.
--   Isso habilita o "Mundo Bizarro" (Venda -> Empenho).
-- ============================================================

-- 1. Adicionar colunas necessárias
ALTER TABLE public.historico_entregas 
ADD COLUMN IF NOT EXISTS item_ata_id BIGINT REFERENCES public.itens_ata(id),
ADD COLUMN IF NOT EXISTS venda_tipo TEXT DEFAULT 'NORMAL',
ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES public.profiles(id);

-- 2. Popular item_ata_id para registros existentes (Backfill)
-- Garante que o histórico antigo continue funcionando com a nova lógica
UPDATE public.historico_entregas h
SET item_ata_id = i.item_ata_id
FROM public.itens i
WHERE h.item_id = i.id
AND h.item_ata_id IS NULL;

-- 3. Tornar item_id opcional (nullable)
ALTER TABLE public.historico_entregas ALTER COLUMN item_id DROP NOT NULL;

-- 4. Adicionar restrição de integridade:
-- Deve ter OU item_id (fluxo normal) OU item_ata_id (venda direta/bizarro)
ALTER TABLE public.historico_entregas
ADD CONSTRAINT check_origem_venda 
CHECK (item_id IS NOT NULL OR item_ata_id IS NOT NULL);

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_historico_item_ata ON public.historico_entregas(item_ata_id);
CREATE INDEX IF NOT EXISTS idx_historico_venda_tipo ON public.historico_entregas(venda_tipo);
