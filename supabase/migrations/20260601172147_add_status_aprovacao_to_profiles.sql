-- ============================================================
-- MIGRATION: 20260601172147_add_status_aprovacao_to_profiles.sql
-- Descrição:
--   Adiciona o campo de status de aprovação na tabela public.profiles
--   para que novos usuários fiquem bloqueados até que o administrador
--   os aprove ou recuse.
-- ============================================================

-- 1. Adicionar a coluna status_aprovacao (padrão 'PENDENTE')
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status_aprovacao TEXT NOT NULL DEFAULT 'PENDENTE';

-- 2. Garantir que todos os usuários já existentes sejam marcados como 'APROVADO'
--    para evitar bloqueio acidental das contas atuais.
UPDATE public.profiles
SET status_aprovacao = 'APROVADO'
WHERE status_aprovacao = 'PENDENTE';
