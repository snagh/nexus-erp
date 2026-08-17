-- ============================================================
-- MIGRATION: 20240507_permissoes_hierarquia.sql
-- Descrição: Implementa hierarquia DEV > SUP > ADM > OP com
--   políticas RLS separadas por operação (SELECT/UPDATE/DELETE).
--   OP: vê só a própria carga. ADM/SUP: vê tudo, edita própria.
--   DELETE: só dono ou DEV.
-- ============================================================

-- ============================================================
-- TABELA: notas (empenhos)
-- ============================================================
DROP POLICY IF EXISTS "Gestão total de notas por dono ou ADM" ON public.notas;
DROP POLICY IF EXISTS "notas_select_policy" ON public.notas;
DROP POLICY IF EXISTS "notas_insert_policy" ON public.notas;
DROP POLICY IF EXISTS "notas_update_policy" ON public.notas;
DROP POLICY IF EXISTS "notas_delete_policy" ON public.notas;

-- SELECT: DEV/SUP/ADM veem tudo; OP só a própria carga
CREATE POLICY "notas_select_policy" ON public.notas
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR assigned_to = auth.uid()
    OR owner_id = auth.uid()
  );

-- INSERT: qualquer autenticado (OP auto-atribui via código)
CREATE POLICY "notas_insert_policy" ON public.notas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: DEV edita qualquer; outros só a própria carga
CREATE POLICY "notas_update_policy" ON public.notas
  FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR assigned_to = auth.uid()
    OR owner_id = auth.uid()
  );

-- DELETE: DEV ou dono
CREATE POLICY "notas_delete_policy" ON public.notas
  FOR DELETE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR owner_id = auth.uid()
  );

-- ============================================================
-- TABELA: atas
-- ============================================================
DROP POLICY IF EXISTS "Gestão total de ATAs por dono ou ADM" ON public.atas;
DROP POLICY IF EXISTS "atas_select_policy" ON public.atas;
DROP POLICY IF EXISTS "atas_insert_policy" ON public.atas;
DROP POLICY IF EXISTS "atas_update_policy" ON public.atas;
DROP POLICY IF EXISTS "atas_delete_policy" ON public.atas;

-- SELECT: DEV/SUP/ADM veem todas; OP só as próprias
CREATE POLICY "atas_select_policy" ON public.atas
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR owner_id = auth.uid()
  );

-- INSERT: qualquer autenticado
CREATE POLICY "atas_insert_policy" ON public.atas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: DEV ou dono
CREATE POLICY "atas_update_policy" ON public.atas
  FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR owner_id = auth.uid()
  );

-- DELETE: DEV ou dono
CREATE POLICY "atas_delete_policy" ON public.atas
  FOR DELETE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR owner_id = auth.uid()
  );

-- ============================================================
-- TABELA: itens_ata
-- ============================================================
DROP POLICY IF EXISTS "Gestão total de itens_ata por dono da ata ou ADM" ON public.itens_ata;
DROP POLICY IF EXISTS "itens_ata_select_policy" ON public.itens_ata;
DROP POLICY IF EXISTS "itens_ata_insert_policy" ON public.itens_ata;
DROP POLICY IF EXISTS "itens_ata_update_policy" ON public.itens_ata;
DROP POLICY IF EXISTS "itens_ata_delete_policy" ON public.itens_ata;

-- SELECT: DEV/SUP/ADM veem todos; OP só itens das próprias ATAs
CREATE POLICY "itens_ata_select_policy" ON public.itens_ata
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR EXISTS (
      SELECT 1 FROM public.atas a
      WHERE a.id = public.itens_ata.ata_id AND a.owner_id = auth.uid()
    )
  );

-- INSERT: qualquer autenticado (vinculado a ATA própria)
CREATE POLICY "itens_ata_insert_policy" ON public.itens_ata
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: DEV ou dono da ATA
CREATE POLICY "itens_ata_update_policy" ON public.itens_ata
  FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR EXISTS (
      SELECT 1 FROM public.atas a
      WHERE a.id = public.itens_ata.ata_id AND a.owner_id = auth.uid()
    )
  );

-- DELETE: DEV ou dono da ATA
CREATE POLICY "itens_ata_delete_policy" ON public.itens_ata
  FOR DELETE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR EXISTS (
      SELECT 1 FROM public.atas a
      WHERE a.id = public.itens_ata.ata_id AND a.owner_id = auth.uid()
    )
  );

-- ============================================================
-- TABELA: itens (empenhos)
-- ============================================================
DROP POLICY IF EXISTS "Gestão total de itens por dono do empenho ou ADM" ON public.itens;
DROP POLICY IF EXISTS "itens_select_policy" ON public.itens;
DROP POLICY IF EXISTS "itens_insert_policy" ON public.itens;
DROP POLICY IF EXISTS "itens_update_policy" ON public.itens;
DROP POLICY IF EXISTS "itens_delete_policy" ON public.itens;

-- SELECT: DEV/SUP/ADM veem todos; OP só os próprios
CREATE POLICY "itens_select_policy" ON public.itens
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR EXISTS (
      SELECT 1 FROM public.notas n
      WHERE n.id = public.itens.nota_id AND n.owner_id = auth.uid()
    )
  );

CREATE POLICY "itens_insert_policy" ON public.itens
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "itens_update_policy" ON public.itens
  FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR EXISTS (
      SELECT 1 FROM public.notas n
      WHERE n.id = public.itens.nota_id AND n.owner_id = auth.uid()
    )
  );

CREATE POLICY "itens_delete_policy" ON public.itens
  FOR DELETE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR EXISTS (
      SELECT 1 FROM public.notas n
      WHERE n.id = public.itens.nota_id AND n.owner_id = auth.uid()
    )
  );

-- ============================================================
-- TABELA: historico_entregas (baixas)
-- ============================================================
DROP POLICY IF EXISTS "Gestão total de vendas por vendedor ou ADM" ON public.historico_entregas;
DROP POLICY IF EXISTS "historico_select_policy" ON public.historico_entregas;
DROP POLICY IF EXISTS "historico_insert_policy" ON public.historico_entregas;
DROP POLICY IF EXISTS "historico_update_policy" ON public.historico_entregas;
DROP POLICY IF EXISTS "historico_delete_policy" ON public.historico_entregas;

-- SELECT: DEV/SUP/ADM veem tudo; OP só as próprias baixas
CREATE POLICY "historico_select_policy" ON public.historico_entregas
  FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR vendedor_id = auth.uid()
  );

CREATE POLICY "historico_insert_policy" ON public.historico_entregas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "historico_update_policy" ON public.historico_entregas
  FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR vendedor_id = auth.uid()
  );

-- DELETE: DEV ou próprio vendedor
CREATE POLICY "historico_delete_policy" ON public.historico_entregas
  FOR DELETE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR vendedor_id = auth.uid()
  );

-- ============================================================
-- TABELA: entidades
-- ============================================================
DROP POLICY IF EXISTS "Gestão total de entidades por dono ou ADM" ON public.entidades;
DROP POLICY IF EXISTS "entidades_select_policy" ON public.entidades;
DROP POLICY IF EXISTS "entidades_insert_policy" ON public.entidades;
DROP POLICY IF EXISTS "entidades_update_policy" ON public.entidades;

-- SELECT: todos veem (necessário para vincular empenhos a prefeituras)
CREATE POLICY "entidades_select_policy" ON public.entidades
  FOR SELECT USING (true);

CREATE POLICY "entidades_insert_policy" ON public.entidades
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "entidades_update_policy" ON public.entidades
  FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM', 'SUP')
    OR owner_id = auth.uid()
    OR owner_id IS NULL
  );
