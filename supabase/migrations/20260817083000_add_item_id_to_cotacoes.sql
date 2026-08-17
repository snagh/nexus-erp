-- Migration: 20260817083000_add_item_id_to_cotacoes.sql
-- Descrição: Adiciona coluna item_id na tabela cotacoes_privado para vincular a solicitação de cotação ao item do empenho que a gerou.

ALTER TABLE public.cotacoes_privado 
ADD COLUMN IF NOT EXISTS item_id BIGINT REFERENCES public.itens(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cotacoes_privado.item_id IS 'ID do item do empenho que originou esta solicitação de cotação';
