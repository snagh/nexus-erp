-- ============================================================
-- MIGRATION: 20260619140200_allow_purchase_from_atas.sql
-- Descrição: 
--   1. Permite que pedidos_compra tenham item_id nulo (compras sem empenho).
--   2. Adiciona a coluna item_ata_id referenciando itens_ata.
-- ============================================================

-- 1. Alterar a coluna item_id para permitir nulos
ALTER TABLE public.pedidos_compra ALTER COLUMN item_id DROP NOT NULL;

-- 2. Adicionar a coluna item_ata_id referenciando itens_ata
ALTER TABLE public.pedidos_compra 
ADD COLUMN IF NOT EXISTS item_ata_id BIGINT REFERENCES public.itens_ata(id) ON DELETE CASCADE;
