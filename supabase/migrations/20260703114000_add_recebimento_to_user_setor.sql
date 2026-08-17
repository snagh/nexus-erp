-- MIGRATION: 20260703114000_add_recebimento_to_user_setor.sql
-- Descrição: Adiciona o setor 'RECEBIMENTO' ao tipo enum user_setor se não existir.

ALTER TYPE public.user_setor ADD VALUE IF NOT EXISTS 'RECEBIMENTO';
