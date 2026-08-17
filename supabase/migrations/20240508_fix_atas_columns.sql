-- MIGRATION: 20240508_fix_atas_columns.sql
-- Descrição: Adiciona colunas de atribuição na tabela atas para suportar a nova hierarquia de acesso.

ALTER TABLE public.atas ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);
ALTER TABLE public.atas ADD COLUMN IF NOT EXISTS distributed_at TIMESTAMPTZ;

-- Atualizar políticas de SELECT para atas para incluir assigned_to
DROP POLICY IF EXISTS "atas_select_policy" ON public.atas;
CREATE POLICY "atas_select_policy" ON public.atas
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
  );
