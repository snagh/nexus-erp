-- ============================================================
-- MIGRATION: 20240416_add_uf_to_notas.sql
-- Problema:
--   A coluna 'uf' existe no código (CriarNota.tsx, supabaseTypes.ts)
--   mas nunca foi adicionada à tabela 'notas' no banco de dados,
--   causando erro PGRST204 ao tentar inserir uma nota.
-- ============================================================

ALTER TABLE notas
ADD COLUMN IF NOT EXISTS uf TEXT;
