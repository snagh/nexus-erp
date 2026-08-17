-- Migration: fix strict isolation policies for public.atas and public.itens_ata to include assigned_to
-- Created At: 2026-05-20

-- 1. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "atas_select_strict" ON public.atas;
DROP POLICY IF EXISTS "atas_update_strict" ON public.atas;
DROP POLICY IF EXISTS "itens_ata_select_strict" ON public.itens_ata;

-- 2. Re-create atas SELECT policy supporting both owners and assigned users
CREATE POLICY "atas_select_strict" ON public.atas
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
);

-- 3. Re-create atas UPDATE policy supporting both owners and assigned users
CREATE POLICY "atas_update_strict" ON public.atas
FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
);

-- 4. Re-create itens_ata SELECT policy supporting both owners and assigned users of the parent ATA
CREATE POLICY "itens_ata_select_strict" ON public.itens_ata
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR EXISTS (
        SELECT 1 FROM public.atas a 
        WHERE a.id = public.itens_ata.ata_id 
        AND (a.owner_id = auth.uid() OR a.assigned_to = auth.uid())
    )
);
