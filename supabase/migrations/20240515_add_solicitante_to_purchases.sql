-- ============================================================
-- MIGRATION: 20240515_add_solicitante_to_purchases.sql
-- Descrição: 
--   1. Adiciona a coluna solicitante_id para rastrear quem pediu a compra.
--   2. Adiciona a coluna categoria para facilitar filtragem consolidada.
-- ============================================================

-- 1. Alterar pedidos_compra
ALTER TABLE public.pedidos_compra 
ADD COLUMN IF NOT EXISTS solicitante_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS categoria VARCHAR(100);

-- 2. Atualizar RLS para permitir que ADMs e usuários de VENDAS/EMPENHOS vejam os pedidos (SELECT)
-- Nota: O ModuloCompras.tsx já tem lógica de filtro por assigned_to para OPERATIONAL,
-- mas precisamos garantir que a RLS não bloqueie a leitura.

DROP POLICY IF EXISTS "pedidos_select_policy" ON public.pedidos_compra;
CREATE POLICY "pedidos_select_policy" ON public.pedidos_compra
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('COMPRAS', 'VENDAS', 'EMPENHOS')
    OR solicitante_id = auth.uid()
);

-- 3. Atualizar política de inserção/update para permitir que solicitantes criem pedidos
DROP POLICY IF EXISTS "pedidos_all_policy" ON public.pedidos_compra;
CREATE POLICY "pedidos_all_policy" ON public.pedidos_compra
FOR ALL USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'COMPRAS'
    OR solicitante_id = auth.uid()
);
