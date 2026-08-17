-- Migration: Add demanda_judicial columns to public.notas and public.pedidos_compra
-- Path: supabase/migrations/20260701142100_add_demanda_judicial.sql

-- 1. Alterar tabela public.notas (Empenhos)
ALTER TABLE public.notas 
ADD COLUMN IF NOT EXISTS demanda_judicial BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS arquivo_demanda_judicial VARCHAR(512);

COMMENT ON COLUMN public.notas.demanda_judicial IS 'Indica se esta Nota de Empenho é decorrente de uma Demanda Judicial';
COMMENT ON COLUMN public.notas.arquivo_demanda_judicial IS 'Caminho do arquivo comprovante da demanda judicial no bucket documentos';

-- 2. Alterar tabela public.pedidos_compra
ALTER TABLE public.pedidos_compra 
ADD COLUMN IF NOT EXISTS demanda_judicial BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS arquivo_demanda_judicial VARCHAR(512);

COMMENT ON COLUMN public.pedidos_compra.demanda_judicial IS 'Indica se esta Solicitação de Compra é decorrente de uma Demanda Judicial';
COMMENT ON COLUMN public.pedidos_compra.arquivo_demanda_judicial IS 'Caminho do arquivo comprovante da demanda judicial no bucket documentos';
