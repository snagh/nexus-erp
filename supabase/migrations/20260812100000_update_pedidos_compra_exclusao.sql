-- ============================================================
-- MIGRATION: 20260812100000_update_pedidos_compra_exclusao.sql
-- Descrição:
--   1. Altera as constraints de chave estrangeira na tabela pedidos_compra
--      de ON DELETE CASCADE para ON DELETE SET NULL.
--   2. Adiciona colunas para armazenar dados de auditoria da exclusão
--      de solicitações e empenhos associados.
-- ============================================================

-- 1. Remover chaves estrangeiras com CASCADE se existirem
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_nota_id_fkey;
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_item_id_fkey;
ALTER TABLE public.pedidos_compra DROP CONSTRAINT IF EXISTS pedidos_compra_item_ata_id_fkey;

-- 2. Recriar chaves estrangeiras com ON DELETE SET NULL
ALTER TABLE public.pedidos_compra
  ADD CONSTRAINT pedidos_compra_nota_id_fkey FOREIGN KEY (nota_id) REFERENCES public.notas(id) ON DELETE SET NULL;

ALTER TABLE public.pedidos_compra
  ADD CONSTRAINT pedidos_compra_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.itens(id) ON DELETE SET NULL;

ALTER TABLE public.pedidos_compra
  ADD CONSTRAINT pedidos_compra_item_ata_id_fkey FOREIGN KEY (item_ata_id) REFERENCES public.itens_ata(id) ON DELETE SET NULL;

-- 3. Adicionar novas colunas de auditoria de exclusão
ALTER TABLE public.pedidos_compra
  ADD COLUMN IF NOT EXISTS justificativa_exclusao TEXT,
  ADD COLUMN IF NOT EXISTS excluido_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS empenho_excluido_por TEXT,
  ADD COLUMN IF NOT EXISTS empenho_excluido_motivo TEXT,
  ADD COLUMN IF NOT EXISTS empenho_excluido_em TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS empenho_numero_legado TEXT,
  ADD COLUMN IF NOT EXISTS item_descricao_legado TEXT;
