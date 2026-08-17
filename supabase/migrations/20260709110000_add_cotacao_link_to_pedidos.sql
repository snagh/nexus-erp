-- Migration: 20260709110000_add_cotacao_link_to_pedidos.sql
-- Descrição: Adiciona coluna cotacao_privado_id em pedidos_compra para rastrear solicitações feitas a partir de cotações.

ALTER TABLE public.pedidos_compra 
ADD COLUMN IF NOT EXISTS cotacao_privado_id UUID REFERENCES public.cotacoes_privado(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pedidos_compra.cotacao_privado_id IS 'ID da cotação privada que originou este pedido de compra';
