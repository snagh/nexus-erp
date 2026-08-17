-- Migration: Add internal purchasing deadline field
ALTER TABLE public.notas ADD COLUMN IF NOT EXISTS data_prazo_compras DATE;
COMMENT ON COLUMN public.notas.data_prazo_compras IS 'Internal deadline for the purchasing department to acquire missing items.';
