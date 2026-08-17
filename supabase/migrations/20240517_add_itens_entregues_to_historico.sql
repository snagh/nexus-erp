-- Migration: 20240517_add_itens_entregues_to_historico.sql
-- Descrição: Adiciona a coluna itens_entregues na tabela historico_entregas para indicar faturamentos sem entrega física.

ALTER TABLE public.historico_entregas 
ADD COLUMN IF NOT EXISTS itens_entregues BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.historico_entregas.itens_entregues IS 'Sinaliza se os itens faturados na NF já foram de fato entregues fisicamente';
