-- ============================================================
-- MIGRATION: 20240508_fix_visibility_assigned_to.sql
-- Descrição: Ajusta políticas RLS para garantir que usuários
--   com empenhos atribuídos (assigned_to) consigam ver os itens
--   e o histórico de entregas desses empenhos.
-- ============================================================

-- 1. Ajuste na tabela 'itens'
DROP POLICY IF EXISTS "itens_select_policy" ON public.itens;
CREATE POLICY "itens_select_policy" ON public.itens
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR EXISTS (
      SELECT 1 FROM public.notas n
      WHERE n.id = public.itens.nota_id 
      AND (n.owner_id = auth.uid() OR n.assigned_to = auth.uid())
    )
  );

-- 2. Ajuste na tabela 'historico_entregas'
-- Permite que o operador veja o histórico de qualquer item que pertença 
-- a um empenho atribuído a ele, facilitando o acompanhamento.
DROP POLICY IF EXISTS "historico_select_policy" ON public.historico_entregas;
CREATE POLICY "historico_select_policy" ON public.historico_entregas
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR vendedor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.itens i
      JOIN public.notas n ON n.id = i.nota_id
      WHERE i.id = public.historico_entregas.item_id 
      AND (n.owner_id = auth.uid() OR n.assigned_to = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.itens_ata ia
      JOIN public.atas a ON a.id = ia.ata_id
      WHERE ia.id = public.historico_entregas.item_ata_id 
      AND a.owner_id = auth.uid()
    )
  );
