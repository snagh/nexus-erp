-- Migration: 20260810000000_create_financeiro_conciliacao.sql
-- Descrição: Criação do tipo enum e tabelas para o controle e conciliação do módulo financeiro.

-- 1. Adicionar o valor 'FINANCEIRO' ao enum user_setor se não existir
ALTER TYPE public.user_setor ADD VALUE IF NOT EXISTS 'FINANCEIRO';

-- 2. TABELA DE DOCUMENTOS FINANCEIROS
CREATE TABLE IF NOT EXISTS public.financeiro_documentos (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ATESTO', 'NF')),
    numero VARCHAR(100) NOT NULL,
    data DATE NOT NULL,
    empresa VARCHAR(100) NOT NULL CHECK (empresa IN ('NEXUS', 'ROSAFARM')),
    entidade_id UUID REFERENCES public.entidades(id) ON DELETE SET NULL,
    valor NUMERIC(15, 2) NOT NULL,
    observacao TEXT,
    vendedor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    historico_entrega_numero VARCHAR(255),
    vinculo_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.financeiro_documentos ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE RLS
-- A. Leitura para qualquer usuário autenticado
CREATE POLICY "financeiro_documentos_select_policy" ON public.financeiro_documentos
FOR SELECT USING (
    auth.role() = 'authenticated'
);

-- B. Escrita para DEVs, ADMs, SUPs ou membros de DIRECAO e FINANCEIRO
CREATE POLICY "financeiro_documentos_write_policy" ON public.financeiro_documentos
FOR ALL USING (
    (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM', 'SUP')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('DIRECAO', 'FINANCEIRO')
);
