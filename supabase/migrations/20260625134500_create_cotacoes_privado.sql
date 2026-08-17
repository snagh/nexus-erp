-- ============================================================
-- MIGRATION: 20260625134500_create_cotacoes_privado.sql
-- Descrição: 
--   1. Garante que o setor VENDAS_PRIVADO exista no tipo user_setor.
--   2. Cria a tabela cotacoes_privado para controle de faltas/cotações.
--   3. Habilita RLS e cria políticas de acesso diferenciadas.
-- ============================================================

-- 1. Adicionar VENDAS_PRIVADO ao tipo enum user_setor se não existir
ALTER TYPE public.user_setor ADD VALUE IF NOT EXISTS 'VENDAS_PRIVADO';

-- 2. Criar a tabela cotacoes_privado
CREATE TABLE IF NOT EXISTS public.cotacoes_privado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_interno VARCHAR(50) NULL,
    data_lancamento DATE DEFAULT CURRENT_DATE,
    descricao TEXT NOT NULL,
    marca VARCHAR(255) NULL,
    situacao VARCHAR(50) DEFAULT 'COTAR', -- 'COTAR' ou 'REABASTECER'
    quantidade NUMERIC(20, 4) NOT NULL,
    unidade VARCHAR(50) NOT NULL,
    comprou_status VARCHAR(255) NULL, -- e.g. "COMPRADO - NAZARIA" ou NULL
    data_compra DATE NULL,
    solicitante VARCHAR(255) NOT NULL,
    solicitante_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    urgente BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Adicionar comentários
COMMENT ON TABLE public.cotacoes_privado IS 'Tabela para lançamento de faltas de medicamentos e materiais para cotação privada';
COMMENT ON COLUMN public.cotacoes_privado.codigo_interno IS 'Código interno do produto no catálogo';
COMMENT ON COLUMN public.cotacoes_privado.situacao IS 'Situação da falta (COTAR ou REABASTECER)';
COMMENT ON COLUMN public.cotacoes_privado.comprou_status IS 'Status indicando se foi comprado e por qual fornecedor (ex: COMPRADO - NAZARIA)';
COMMENT ON COLUMN public.cotacoes_privado.urgente IS 'Flag de urgência para destacar o item em vermelho na listagem';

-- 3. Habilitar RLS
ALTER TABLE public.cotacoes_privado ENABLE ROW LEVEL SECURITY;

-- 4. Criar políticas RLS
-- A. SELECT: Qualquer usuário autenticado pode visualizar
CREATE POLICY "Permitir leitura para todos os autenticados" 
ON public.cotacoes_privado FOR SELECT TO authenticated 
USING (true);

-- B. INSERT: Vendedores de Vendas Privadas e Administradores/Direção podem lançar
CREATE POLICY "Permitir inserção para Vendas Privado e Admins" 
ON public.cotacoes_privado FOR INSERT TO authenticated 
WITH CHECK (
    (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'VENDAS_PRIVADO'
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'DIRECAO'
    OR (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
);

-- C. UPDATE: Dono do registro (enquanto não comprado ou geral se permitido) ou Admins
CREATE POLICY "Permitir atualização para dono do registro e Admins" 
ON public.cotacoes_privado FOR UPDATE TO authenticated 
USING (
    (owner_id = auth.uid() AND (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'VENDAS_PRIVADO')
    OR (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'DIRECAO'
)
WITH CHECK (
    (owner_id = auth.uid() AND (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'VENDAS_PRIVADO')
    OR (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'DIRECAO'
);

-- D. DELETE: Dono do registro ou Admins
CREATE POLICY "Permitir exclusão para dono do registro e Admins" 
ON public.cotacoes_privado FOR DELETE TO authenticated 
USING (
    (owner_id = auth.uid() AND (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'VENDAS_PRIVADO')
    OR (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'DIRECAO'
);
