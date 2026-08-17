-- Migration: Add data_notificacao column to pedidos_compra
ALTER TABLE public.pedidos_compra 
ADD COLUMN IF NOT EXISTS data_notificacao DATE;
