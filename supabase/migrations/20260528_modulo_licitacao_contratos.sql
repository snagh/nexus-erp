-- Migration: 20260528_modulo_licitacao_contratos.sql
-- Descrição: Criação das tabelas de Contratos, Itens de Contrato e Aditivos (para ATAs e Contratos).
--            Adiciona chaves estrangeiras em Notas e Itens e atualiza políticas RLS para o novo setor 'LICIT'.

-- Garantir que o valor 'LICIT' exista no enum user_setor
ALTER TYPE public.user_setor ADD VALUE IF NOT EXISTS 'LICIT';

-- ============================================================
-- 1. TABELA DE CONTRATOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contratos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    numero_contrato varchar NOT NULL,
    ata_id uuid REFERENCES public.atas(id) ON DELETE SET NULL, -- Vínculo opcional
    entidade_id uuid REFERENCES public.entidades(id) ON DELETE SET NULL,
    objeto_contrato text,
    valor_total numeric,
    data_assinatura date,
    data_validade date,
    arquivo_caminho varchar,
    owner_id uuid REFERENCES public.profiles(id),
    assigned_to uuid REFERENCES public.profiles(id),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 2. TABELA DE ITENS DO CONTRATO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.itens_contrato (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    contrato_id uuid REFERENCES public.contratos(id) ON DELETE CASCADE NOT NULL,
    item_ata_id integer REFERENCES public.itens_ata(id) ON DELETE SET NULL, -- Link com o item correspondente da ATA
    numero_item varchar,
    descricao text NOT NULL,
    unidade varchar,
    quantidade_contratada numeric NOT NULL,
    valor_unitario numeric NOT NULL,
    marca varchar,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 3. ADICIONAR COLUNAS DE CONTRATO EM NOTAS E ITENS
-- ============================================================
ALTER TABLE public.notas ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES public.contratos(id) ON DELETE SET NULL;
ALTER TABLE public.itens ADD COLUMN IF NOT EXISTS item_contrato_id uuid REFERENCES public.itens_contrato(id) ON DELETE SET NULL;

-- ============================================================
-- 4. TABELAS DE ADITIVOS DE ATA E CONTRATO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.aditivos_ata (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    ata_id uuid REFERENCES public.atas(id) ON DELETE CASCADE,
    contrato_id uuid REFERENCES public.contratos(id) ON DELETE CASCADE,
    numero_aditivo varchar NOT NULL,
    tipo varchar NOT NULL CHECK (tipo IN ('QUANTIDADE', 'PRAZO', 'AMBOS')),
    nova_data_validade date,
    justificativa text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by uuid REFERENCES public.profiles(id),
    CONSTRAINT chk_aditivo_parent CHECK (
        (ata_id IS NOT NULL AND contrato_id IS NULL) OR 
        (contrato_id IS NOT NULL AND ata_id IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.aditivos_itens_ata (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    aditivo_id uuid REFERENCES public.aditivos_ata(id) ON DELETE CASCADE NOT NULL,
    item_ata_id integer REFERENCES public.itens_ata(id) ON DELETE CASCADE,
    item_contrato_id uuid REFERENCES public.itens_contrato(id) ON DELETE CASCADE,
    quantidade_adicionada numeric NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chk_aditivo_item CHECK (
        (item_ata_id IS NOT NULL AND item_contrato_id IS NULL) OR 
        (item_contrato_id IS NOT NULL AND item_ata_id IS NULL)
    )
);

-- ============================================================
-- 5. HABILITAR ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_contrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aditivos_ata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aditivos_itens_ata ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. DISPARADORES (TRIGGERS) PARA SINCRONIZAR ADITIVOS
-- ============================================================

-- A. Trigger para atualizar validade da ATA ou Contrato após Aditivo
CREATE OR REPLACE FUNCTION public.fn_processar_aditivo_validade()
RETURNS TRIGGER AS $$
BEGIN
    -- Se tiver aditivo de prazo ou ambos
    IF NEW.tipo IN ('PRAZO', 'AMBOS') AND NEW.nova_data_validade IS NOT NULL THEN
        -- Atualizar ATA
        IF NEW.ata_id IS NOT NULL THEN
            UPDATE public.atas 
            SET data_validade = NEW.nova_data_validade 
            WHERE id = NEW.ata_id;
        -- Atualizar Contrato
        ELSIF NEW.contrato_id IS NOT NULL THEN
            UPDATE public.contratos 
            SET data_validade = NEW.nova_data_validade 
            WHERE id = NEW.contrato_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_aditivo_validade
AFTER INSERT OR UPDATE ON public.aditivos_ata
FOR EACH ROW EXECUTE FUNCTION public.fn_processar_aditivo_validade();

-- B. Trigger para atualizar quantidades dos itens após Aditivo de Quantidade
CREATE OR REPLACE FUNCTION public.fn_processar_aditivo_quantidade()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo varchar;
BEGIN
    -- Obter o tipo do aditivo pai
    SELECT tipo INTO v_tipo FROM public.aditivos_ata WHERE id = NEW.aditivo_id;
    
    IF v_tipo IN ('QUANTIDADE', 'AMBOS') THEN
        -- Atualizar Item de ATA
        IF NEW.item_ata_id IS NOT NULL THEN
            UPDATE public.itens_ata 
            SET quantidade_registrada = quantidade_registrada + NEW.quantidade_adicionada
            WHERE id = NEW.item_ata_id;
        -- Atualizar Item de Contrato
        ELSIF NEW.item_contrato_id IS NOT NULL THEN
            UPDATE public.itens_contrato 
            SET quantidade_contratada = quantidade_contratada + NEW.quantidade_adicionada
            WHERE id = NEW.item_contrato_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_aditivo_quantidade
AFTER INSERT ON public.aditivos_itens_ata
FOR EACH ROW EXECUTE FUNCTION public.fn_processar_aditivo_quantidade();

-- ============================================================
-- 7. REFORMULAR POLÍTICAS RLS PARA ACESSO DO SETOR LICIT
-- ============================================================

-- A. Limpar e recriar políticas em ATAs para incluir setor 'LICIT' e 'DIRECAO'
DROP POLICY IF EXISTS "atas_select_strict" ON public.atas;
CREATE POLICY "atas_select_strict" ON public.atas
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('LICIT', 'DIRECAO')
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
);

DROP POLICY IF EXISTS "atas_update_strict" ON public.atas;
CREATE POLICY "atas_update_strict" ON public.atas
FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'LICIT'
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
);

-- B. Limpar e recriar políticas em ITENS_ATA para incluir setor 'LICIT' e 'DIRECAO'
DROP POLICY IF EXISTS "itens_ata_select_strict" ON public.itens_ata;
CREATE POLICY "itens_ata_select_strict" ON public.itens_ata
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('LICIT', 'DIRECAO')
    OR EXISTS (
        SELECT 1 FROM public.atas a 
        WHERE a.id = public.itens_ata.ata_id 
        AND (a.owner_id = auth.uid() OR a.assigned_to = auth.uid())
    )
);

-- C. Políticas de RLS para CONTRATOS
CREATE POLICY "contratos_select_policy" ON public.contratos
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('LICIT', 'DIRECAO')
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
);

CREATE POLICY "contratos_insert_policy" ON public.contratos
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "contratos_update_policy" ON public.contratos
FOR UPDATE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'LICIT'
    OR owner_id = auth.uid()
    OR assigned_to = auth.uid()
);

CREATE POLICY "contratos_delete_policy" ON public.contratos
FOR DELETE USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'DEV'
    OR (SELECT nivel FROM public.profiles WHERE id = auth.uid()) = 'ADM' AND (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'LICIT'
    OR owner_id = auth.uid()
);

-- D. Políticas de RLS para ITENS_CONTRATO
CREATE POLICY "itens_contrato_select_policy" ON public.itens_contrato
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('LICIT', 'DIRECAO')
    OR EXISTS (
        SELECT 1 FROM public.contratos c 
        WHERE c.id = public.itens_contrato.contrato_id 
        AND (c.owner_id = auth.uid() OR c.assigned_to = auth.uid())
    )
);

CREATE POLICY "itens_contrato_write_policy" ON public.itens_contrato
FOR ALL USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'LICIT'
    OR EXISTS (
        SELECT 1 FROM public.contratos c 
        WHERE c.id = public.itens_contrato.contrato_id 
        AND (c.owner_id = auth.uid() OR c.assigned_to = auth.uid())
    )
);

-- E. Políticas de RLS para ADITIVOS_ATA
CREATE POLICY "aditivos_select_policy" ON public.aditivos_ata
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('LICIT', 'DIRECAO')
    OR EXISTS (
        SELECT 1 FROM public.atas a 
        WHERE a.id = public.aditivos_ata.ata_id 
        AND (a.owner_id = auth.uid() OR a.assigned_to = auth.uid())
    )
    OR EXISTS (
        SELECT 1 FROM public.contratos c 
        WHERE c.id = public.aditivos_ata.contrato_id 
        AND (c.owner_id = auth.uid() OR c.assigned_to = auth.uid())
    )
);

CREATE POLICY "aditivos_write_policy" ON public.aditivos_ata
FOR ALL USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'LICIT'
);

-- F. Políticas de RLS para ADITIVOS_ITENS_ATA
CREATE POLICY "aditivos_itens_select_policy" ON public.aditivos_itens_ata
FOR SELECT USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'SUP', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('LICIT', 'DIRECAO')
);

CREATE POLICY "aditivos_itens_write_policy" ON public.aditivos_itens_ata
FOR ALL USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'LICIT'
);
