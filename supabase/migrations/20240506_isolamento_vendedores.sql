-- ============================================================
-- MIGRATION: 20240506_isolamento_vendedores_v3.sql
-- Descrição: 
--   1. Adiciona colunas flexíveis em itens_ata para suportar 
--      diferentes modelos de prefeituras (marca, lote, codigo, etc).
--   2. Corrige as políticas RLS para permitir gestão completa por vendedores.
-- ============================================================

-- 0. Adicionar colunas flexíveis (caso não existam)
DO $$ 
BEGIN 
    -- Coluna de Marca
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='itens_ata' AND column_name='marca') THEN
        ALTER TABLE public.itens_ata ADD COLUMN marca TEXT;
    END IF;
    
    -- Coluna de Lote (Comum em licitações municipais)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='itens_ata' AND column_name='lote') THEN
        ALTER TABLE public.itens_ata ADD COLUMN lote TEXT;
    END IF;

    -- Coluna de Código do Item (Código da Prefeitura)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='itens_ata' AND column_name='codigo_item') THEN
        ALTER TABLE public.itens_ata ADD COLUMN codigo_item TEXT;
    END IF;
    
    -- Coluna de Mapeamento IA
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='itens_ata' AND column_name='mapeamento_ia') THEN
        ALTER TABLE public.itens_ata ADD COLUMN mapeamento_ia TEXT;
    END IF;

    -- ADICIONAR NA TABELA DE ITENS (EMPENHOS)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='itens' AND column_name='lote') THEN
        ALTER TABLE public.itens ADD COLUMN lote TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='itens' AND column_name='codigo_item') THEN
        ALTER TABLE public.itens ADD COLUMN codigo_item TEXT;
    END IF;
END $$;

-- 1. Habilitar RLS (reforço)
ALTER TABLE public.atas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_ata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entidades ENABLE ROW LEVEL SECURITY;

-- 2. Política para ATAS
DROP POLICY IF EXISTS "Vendedores veem apenas suas atas ou tudo se ADM" ON public.atas;
DROP POLICY IF EXISTS "Gestão total de ATAs por dono ou ADM" ON public.atas;
CREATE POLICY "Gestão total de ATAs por dono ou ADM" 
ON public.atas
FOR ALL 
USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('ADM', 'DEV')
    OR owner_id = auth.uid()
)
WITH CHECK (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('ADM', 'DEV')
    OR owner_id = auth.uid()
);

-- 3. Política para ITENS DA ATA
DROP POLICY IF EXISTS "Vendedores veem itens de suas atas" ON public.itens_ata;
DROP POLICY IF EXISTS "Gestão total de itens_ata por dono da ata ou ADM" ON public.itens_ata;
CREATE POLICY "Gestão total de itens_ata por dono da ata ou ADM" 
ON public.itens_ata
FOR ALL 
USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('ADM', 'DEV')
    OR EXISTS (
        SELECT 1 FROM public.atas a 
        WHERE a.id = public.itens_ata.ata_id 
        AND a.owner_id = auth.uid()
    )
)
WITH CHECK (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('ADM', 'DEV')
    OR EXISTS (
        SELECT 1 FROM public.atas a 
        WHERE a.id = public.itens_ata.ata_id 
        AND a.owner_id = auth.uid()
    )
);

-- 4. Política para ITENS DE EMPENHO/NOTA
DROP POLICY IF EXISTS "Vendedores veem itens de seus empenhos" ON public.itens;
DROP POLICY IF EXISTS "Gestão total de itens por dono do empenho ou ADM" ON public.itens;
CREATE POLICY "Gestão total de itens por dono do empenho ou ADM" 
ON public.itens
FOR ALL 
USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('ADM', 'DEV')
    OR EXISTS (
        SELECT 1 FROM public.notas n 
        WHERE n.id = public.itens.nota_id 
        AND n.owner_id = auth.uid()
    )
)
WITH CHECK (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('ADM', 'DEV')
    OR EXISTS (
        SELECT 1 FROM public.notas n 
        WHERE n.id = public.itens.nota_id 
        AND n.owner_id = auth.uid()
    )
);

-- 5. Política para HISTÓRICO DE ENTREGAS (Vendas)
DROP POLICY IF EXISTS "Vendedores veem apenas suas vendas ou tudo se ADM" ON public.historico_entregas;
DROP POLICY IF EXISTS "Gestão total de vendas por vendedor ou ADM" ON public.historico_entregas;
CREATE POLICY "Gestão total de vendas por vendedor ou ADM" 
ON public.historico_entregas
FOR ALL
USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('ADM', 'DEV')
    OR vendedor_id = auth.uid()
)
WITH CHECK (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('ADM', 'DEV')
    OR vendedor_id = auth.uid()
);

-- 6. Política para ENTIDADES (Órgãos/Prefeituras)
DROP POLICY IF EXISTS "Vendedores veem entidades" ON public.entidades;
DROP POLICY IF EXISTS "Gestão total de entidades por dono ou ADM" ON public.entidades;
CREATE POLICY "Gestão total de entidades por dono ou ADM" 
ON public.entidades
FOR ALL
USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('ADM', 'DEV')
    OR owner_id = auth.uid()
    OR owner_id IS NULL -- Permite ver entidades globais sem dono
)
WITH CHECK (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('ADM', 'DEV')
    OR owner_id = auth.uid()
);
