-- ============================================================
-- MIGRATION: 20240515_fix_isolation_regression.sql
-- Descrição: 
--   1. Corrige a falta do 'assigned_to' nas políticas de ATAs.
--   2. Garante que vendedores vejam ATAs atribuídas a eles, não só as que criaram.
-- ============================================================

-- 1. Corrigir ATAs (Adicionar assigned_to)
DROP POLICY IF EXISTS "atas_select_strict" ON public.atas;
CREATE POLICY "atas_select_strict" ON public.atas
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
);

DROP POLICY IF EXISTS "atas_update_strict" ON public.atas;
CREATE POLICY "atas_update_strict" ON public.atas
FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
);

-- 2. Corrigir Itens de ATA (Adicionar verificação de assigned_to na ATA pai)
DROP POLICY IF EXISTS "itens_ata_select_strict" ON public.itens_ata;
CREATE POLICY "itens_ata_select_strict" ON public.itens_ata
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR EXISTS (
        SELECT 1 FROM public.atas a 
        WHERE a.id = public.itens_ata.ata_id 
        AND (a.owner_id = auth.uid() OR a.assigned_to = auth.uid())
    )
);

-- 3. Corrigir Notas (Empenhos) para garantir que assigned_to sempre funcione
DROP POLICY IF EXISTS "notas_select_strict" ON public.notas;
CREATE POLICY "notas_select_strict" ON public.notas
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR owner_id = auth.uid() 
    OR assigned_to = auth.uid()
    -- Fallback para dados legados sem dono, mas do mesmo setor
    OR (
        owner_id IS NULL 
        AND assigned_to IS NULL 
        AND setor = (SELECT setor FROM public.profiles WHERE id = auth.uid())
    )
);
