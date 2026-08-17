-- ============================================================
-- MIGRATION: 20240507_fix_historico_created_at.sql
-- Descrição: Adiciona a coluna created_at na tabela historico_entregas
--   caso ela não exista (corrigindo erro 42703 reportado).
-- ============================================================

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='historico_entregas' AND column_name='created_at') THEN
        ALTER TABLE public.historico_entregas ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
