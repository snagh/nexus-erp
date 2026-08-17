-- ============================================================
-- MIGRATION: 20240505_add_uf_to_atas.sql
-- Problema:
--   A coluna 'uf' existe no código (Atas.tsx, CriarNota.tsx)
--   mas não existe na tabela 'atas' no banco de dados.
-- ============================================================

ALTER TABLE atas
ADD COLUMN IF NOT EXISTS uf TEXT;
