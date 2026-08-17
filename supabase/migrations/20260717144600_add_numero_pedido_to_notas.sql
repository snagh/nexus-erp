-- Migration: Add numero_pedido to public.notas
ALTER TABLE public.notas ADD COLUMN IF NOT EXISTS numero_pedido TEXT;
