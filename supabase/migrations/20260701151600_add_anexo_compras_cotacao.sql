-- Migration: add anexo_compras_url to cotacoes_privado
ALTER TABLE cotacoes_privado ADD COLUMN IF NOT EXISTS anexo_compras_url text;
