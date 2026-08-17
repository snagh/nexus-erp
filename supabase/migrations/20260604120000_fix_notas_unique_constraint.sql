-- Migration: 20260604120000_fix_notas_unique_constraint.sql
-- Descrição: Altera a restrição de unicidade dos empenhos para ser por órgão/cliente (entidade_id) em vez de global.

-- 1. Remove a restrição antiga (unicidade global de numero_ne)
ALTER TABLE public.notas DROP CONSTRAINT IF EXISTS notas_numero_ne_key;

-- 2. Adiciona a nova restrição (unicidade por número e cliente)
ALTER TABLE public.notas ADD CONSTRAINT notas_numero_ne_entidade_id_key UNIQUE (numero_ne, entidade_id);

COMMENT ON CONSTRAINT notas_numero_ne_entidade_id_key ON public.notas IS 'Garante a unicidade do número do empenho por cliente/entidade.';
