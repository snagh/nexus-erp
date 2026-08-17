-- ============================================================
-- MIGRATION: 20240515_strict_isolation_op.sql
-- Descrição: 
--   1. Limpa todas as políticas antigas para evitar sobreposição (OR).
--   2. Define regras estritas de isolamento:
--      - ADM, DEV, SUP: Acesso total (visão de gestão).
--      - OP (Operador): Vê apenas o que CRIOU ou o que lhe foi ATRIBUÍDO.
-- ============================================================

-- 0. HABILITAR RLS (Garantia)
ALTER TABLE public.notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_ata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_entregas ENABLE ROW LEVEL SECURITY;

-- 1. LIMPEZA DE POLÍTICAS ANTIGAS (NOTAS)
DROP POLICY IF EXISTS "notas_select_policy" ON public.notas;
DROP POLICY IF EXISTS "notas_insert_policy" ON public.notas;
DROP POLICY IF EXISTS "notas_update_policy" ON public.notas;
DROP POLICY IF EXISTS "notas_delete_policy" ON public.notas;
DROP POLICY IF EXISTS "Admins possuem acesso total às notas" ON public.notas;
DROP POLICY IF EXISTS "Gestão total de notas por dono ou ADM" ON public.notas;

-- 2. LIMPEZA DE POLÍTICAS ANTIGAS (ATAS)
DROP POLICY IF EXISTS "atas_select_policy" ON public.atas;
DROP POLICY IF EXISTS "atas_insert_policy" ON public.atas;
DROP POLICY IF EXISTS "atas_update_policy" ON public.atas;
DROP POLICY IF EXISTS "atas_delete_policy" ON public.atas;
DROP POLICY IF EXISTS "Admins possuem acesso total às atas" ON public.atas;
DROP POLICY IF EXISTS "Gestão total de ATAs por dono ou ADM" ON public.atas;
DROP POLICY IF EXISTS "Vendedores veem apenas suas atas ou tudo se ADM" ON public.atas;
DROP POLICY IF EXISTS "Usuários podem ver suas próprias atas" ON public.atas;

-- 3. LIMPEZA DE POLÍTICAS ANTIGAS (ITENS)
DROP POLICY IF EXISTS "itens_select_policy" ON public.itens;
DROP POLICY IF EXISTS "itens_insert_policy" ON public.itens;
DROP POLICY IF EXISTS "itens_update_policy" ON public.itens;
DROP POLICY IF EXISTS "itens_delete_policy" ON public.itens;
DROP POLICY IF EXISTS "Admins possuem acesso total aos itens" ON public.itens;
DROP POLICY IF EXISTS "Gestão total de itens por dono do empenho ou ADM" ON public.itens;
DROP POLICY IF EXISTS "Vendedores veem itens de seus empenhos" ON public.itens;

-- 4. LIMPEZA DE POLÍTICAS ANTIGAS (ITENS_ATA)
DROP POLICY IF EXISTS "itens_ata_select_policy" ON public.itens_ata;
DROP POLICY IF EXISTS "itens_ata_insert_policy" ON public.itens_ata;
DROP POLICY IF EXISTS "itens_ata_update_policy" ON public.itens_ata;
DROP POLICY IF EXISTS "itens_ata_delete_policy" ON public.itens_ata;
DROP POLICY IF EXISTS "Admins possuem acesso total aos itens_ata" ON public.itens_ata;
DROP POLICY IF EXISTS "Gestão total de itens_ata por dono da ata ou ADM" ON public.itens_ata;
DROP POLICY IF EXISTS "Vendedores veem itens de suas atas" ON public.itens_ata;

-- 5. LIMPEZA DE POLÍTICAS ANTIGAS (ENTIDADES)
DROP POLICY IF EXISTS "entidades_select_policy" ON public.entidades;
DROP POLICY IF EXISTS "entidades_insert_policy" ON public.entidades;
DROP POLICY IF EXISTS "entidades_update_policy" ON public.entidades;
DROP POLICY IF EXISTS "Admins possuem acesso total às entidades" ON public.entidades;
DROP POLICY IF EXISTS "Gestão total de entidades por dono ou ADM" ON public.entidades;

-- 6. LIMPEZA DE POLÍTICAS ANTIGAS (HISTÓRICO/VENDAS)
DROP POLICY IF EXISTS "historico_select_policy" ON public.historico_entregas;
DROP POLICY IF EXISTS "historico_insert_policy" ON public.historico_entregas;
DROP POLICY IF EXISTS "historico_update_policy" ON public.historico_entregas;
DROP POLICY IF EXISTS "historico_delete_policy" ON public.historico_entregas;
DROP POLICY IF EXISTS "Gestão total de vendas por vendedor ou ADM" ON public.historico_entregas;


-- ============================================================
-- NOVAS POLÍTICAS UNIFICADAS E ESTREITAS
-- ============================================================

-- A. TABELA: notas (Empenhos)
CREATE POLICY "notas_select_strict" ON public.notas
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR owner_id = auth.uid() 
    OR assigned_to = auth.uid()
);

CREATE POLICY "notas_insert_strict" ON public.notas
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "notas_update_strict" ON public.notas
FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
);

CREATE POLICY "notas_delete_strict" ON public.notas
FOR DELETE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR owner_id = auth.uid()
);

-- B. TABELA: atas (ARPs)
CREATE POLICY "atas_select_strict" ON public.atas
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR owner_id = auth.uid()
);

CREATE POLICY "atas_insert_strict" ON public.atas
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "atas_update_strict" ON public.atas
FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR owner_id = auth.uid()
);

-- C. TABELA: itens (Itens de Empenho)
CREATE POLICY "itens_select_strict" ON public.itens
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR EXISTS (
        SELECT 1 FROM public.notas n 
        WHERE n.id = public.itens.nota_id 
        AND (n.owner_id = auth.uid() OR n.assigned_to = auth.uid())
    )
);

CREATE POLICY "itens_all_strict" ON public.itens
FOR ALL USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR EXISTS (
        SELECT 1 FROM public.notas n 
        WHERE n.id = public.itens.nota_id 
        AND (n.owner_id = auth.uid() OR n.assigned_to = auth.uid())
    )
);

-- D. TABELA: itens_ata (Itens de ARP)
CREATE POLICY "itens_ata_select_strict" ON public.itens_ata
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR EXISTS (
        SELECT 1 FROM public.atas a 
        WHERE a.id = public.itens_ata.ata_id 
        AND a.owner_id = auth.uid()
    )
);

-- E. TABELA: entidades (Clientes/Prefeituras)
CREATE POLICY "entidades_select_strict" ON public.entidades
FOR SELECT USING (true); -- Aberto para todos vincularem notas

CREATE POLICY "entidades_write_strict" ON public.entidades
FOR ALL USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR owner_id = auth.uid()
    OR owner_id IS NULL
);

-- F. TABELA: historico_entregas (Baixas/Vendas)
CREATE POLICY "historico_select_strict" ON public.historico_entregas
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR vendedor_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.itens i
        JOIN public.notas n ON n.id = i.nota_id
        WHERE i.id = public.historico_entregas.item_id 
        AND (n.owner_id = auth.uid() OR n.assigned_to = auth.uid())
    )
);

CREATE POLICY "historico_all_strict" ON public.historico_entregas
FOR ALL USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR vendedor_id = auth.uid()
);
