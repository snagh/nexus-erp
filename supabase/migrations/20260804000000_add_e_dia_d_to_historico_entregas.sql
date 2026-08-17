-- Migration: Add e_dia_d to historico_entregas
ALTER TABLE public.historico_entregas ADD COLUMN IF NOT EXISTS e_dia_d BOOLEAN DEFAULT false;
