-- Migration: 20260709090000_allow_vendas_cotacao_privado.sql
-- Descrição: Permite que o setor VENDAS (vendas públicas) tenha permissões na tabela cotacoes_privado.

-- 1. Drop das políticas antigas
DROP POLICY IF EXISTS "Permitir inserção para Vendas Privado e Admins" ON public.cotacoes_privado;
DROP POLICY IF EXISTS "Permitir atualização para dono do registro e Admins" ON public.cotacoes_privado;
DROP POLICY IF EXISTS "Permitir exclusão para dono do registro e Admins" ON public.cotacoes_privado;

-- 2. Recriação com inclusão do setor VENDAS

-- INSERT
CREATE POLICY "Permitir inserção para Vendas Privado, Vendas Publicas e Admins" 
ON public.cotacoes_privado FOR INSERT TO authenticated 
WITH CHECK (
    (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('VENDAS_PRIVADO', 'VENDAS')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'DIRECAO'
    OR (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
);

-- UPDATE
CREATE POLICY "Permitir atualização para dono do registro e Admins" 
ON public.cotacoes_privado FOR UPDATE TO authenticated 
USING (
    (owner_id = auth.uid() AND (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('VENDAS_PRIVADO', 'VENDAS'))
    OR (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'DIRECAO'
)
WITH CHECK (
    (owner_id = auth.uid() AND (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('VENDAS_PRIVADO', 'VENDAS'))
    OR (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'DIRECAO'
);

-- DELETE
CREATE POLICY "Permitir exclusão para dono do registro e Admins" 
ON public.cotacoes_privado FOR DELETE TO authenticated 
USING (
    (owner_id = auth.uid() AND (SELECT setor FROM public.profiles WHERE id = auth.uid()) IN ('VENDAS_PRIVADO', 'VENDAS'))
    OR (SELECT nivel FROM public.profiles WHERE id = auth.uid()) IN ('DEV', 'ADM')
    OR (SELECT setor FROM public.profiles WHERE id = auth.uid()) = 'DIRECAO'
);
