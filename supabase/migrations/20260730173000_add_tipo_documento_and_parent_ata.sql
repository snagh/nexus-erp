-- Add tipo_documento, parent_ata_id and data_assinatura to public.atas
ALTER TABLE public.atas ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'ATA';
ALTER TABLE public.atas ADD COLUMN IF NOT EXISTS parent_ata_id UUID REFERENCES public.atas(id) ON DELETE SET NULL;
ALTER TABLE public.atas ADD COLUMN IF NOT EXISTS data_assinatura DATE;

-- Index for fast parent lookup
CREATE INDEX IF NOT EXISTS idx_atas_parent_ata_id ON public.atas(parent_ata_id);
