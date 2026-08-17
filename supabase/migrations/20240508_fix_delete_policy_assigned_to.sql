-- ============================================================
-- MIGRATION: 20240508_fix_delete_policy_assigned_to.sql
-- Descrição: Ajusta a política de DELETE da tabela 
--   historico_entregas para permitir que o responsável 
--   atribuído ao empenho (assigned_to) consiga reverter 
--   as baixas, resolvendo o problema de registros legados.
-- ============================================================

DROP POLICY IF EXISTS "historico_delete_policy" ON public.historico_entregas;

CREATE POLICY "historico_delete_policy" ON public.historico_entregas
  FOR DELETE USING (
    -- 1. Desenvolvedores (DEV) podem deletar tudo
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    
    -- 2. Administradores (ADM) podem deletar tudo (conforme nova regra de negócio)
    OR (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'ADM'
    
    -- 3. O próprio autor da baixa
    OR vendedor_id = auth.uid()
    
    -- 4. O responsável atribuído ao empenho (fallback para dados legados)
    OR EXISTS (
      SELECT 1 FROM public.itens i
      JOIN public.notas n ON n.id = i.nota_id
      WHERE i.id = public.historico_entregas.item_id 
      AND n.assigned_to = auth.uid()
    )
  );
