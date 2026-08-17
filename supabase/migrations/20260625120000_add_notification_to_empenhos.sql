-- Migration: Add notification columns to the notas (empenhos) table
-- Path: supabase/migrations/20260625120000_add_notification_to_empenhos.sql

ALTER TABLE public.notas 
ADD COLUMN IF NOT EXISTS e_notificacao BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS arquivo_notificacao VARCHAR(512);

COMMENT ON COLUMN public.notas.e_notificacao IS 'Indica se esta Nota de Empenho é decorrente de uma Notificação';
COMMENT ON COLUMN public.notas.arquivo_notificacao IS 'Caminho do arquivo comprovante da notificação no bucket documentos';
