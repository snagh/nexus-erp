-- ============================================================
-- MIGRATION: 20240511_restricao_op_proprio_cadastro.sql
-- Descrição: Restringe usuários OP a visualizarem e editarem 
--   apenas os empenhos que eles mesmos cadastraram (owner_id).
--   Remove a permissão de visualização baseada em atribuição (assigned_to)
--   para este nível de acesso.
-- ============================================================

-- 1. TABELA: notas (empenhos)
DROP POLICY IF EXISTS "notas_select_policy" ON public.notas;
CREATE POLICY "notas_select_policy" ON public.notas
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "notas_update_policy" ON public.notas;
CREATE POLICY "notas_update_policy" ON public.notas
  FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR owner_id = auth.uid()
  );

-- 2. TABELA: itens (itens de empenho)
DROP POLICY IF EXISTS "itens_select_policy" ON public.itens;
CREATE POLICY "itens_select_policy" ON public.itens
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR EXISTS (
      SELECT 1 FROM public.notas n
      WHERE n.id = public.itens.nota_id 
      AND n.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "itens_update_policy" ON public.itens;
CREATE POLICY "itens_update_policy" ON public.itens
  FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR EXISTS (
      SELECT 1 FROM public.notas n
      WHERE n.id = public.itens.nota_id 
      AND n.owner_id = auth.uid()
    )
  );

-- 3. TABELA: historico_entregas (baixas/vendas)
DROP POLICY IF EXISTS "historico_select_policy" ON public.historico_entregas;
CREATE POLICY "historico_select_policy" ON public.historico_entregas
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR vendedor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.itens i
      JOIN public.notas n ON n.id = i.nota_id
      WHERE i.id = public.historico_entregas.item_id 
      AND n.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.itens_ata ia
      JOIN public.atas a ON a.id = ia.ata_id
      WHERE ia.id = public.historico_entregas.item_ata_id 
      AND a.owner_id = auth.uid()
    )
  );
