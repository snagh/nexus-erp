-- ============================================================
-- MIGRATION: 20260624100000_add_compras_features.sql
-- Descrição: 
--   1. Adiciona o campo tarefa_padrao à tabela profiles.
--   2. Adiciona campos de registro de compra e controle de notificações à tabela pedidos_compra.
-- ============================================================

-- 1. Alterar tabela public.profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS tarefa_padrao VARCHAR(255) NULL;

-- 2. Alterar tabela public.pedidos_compra
ALTER TABLE public.pedidos_compra 
ADD COLUMN IF NOT EXISTS valor_unitario_comprado NUMERIC NULL,
ADD COLUMN IF NOT EXISTS marca_comprada VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS prazo_estimado_chegada DATE NULL,
ADD COLUMN IF NOT EXISTS e_notificacao BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS arquivo_notificacao VARCHAR(255) NULL;
