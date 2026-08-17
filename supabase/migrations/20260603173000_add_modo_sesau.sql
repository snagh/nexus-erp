-- Migration: Add modo_sesau to notas
ALTER TABLE public.notas ADD COLUMN IF NOT EXISTS modo_sesau BOOLEAN DEFAULT false;
