-- Comprehensive Migration: Sync all frontend form fields with database
-- Run this in the Supabase SQL Editor

-- ============================================
-- TABLE: notas (Document Header)
-- ============================================

-- 1. data_prazo_compras: Internal deadline for the procurement team
ALTER TABLE notas
ADD COLUMN IF NOT EXISTS data_prazo_compras DATE;

COMMENT ON COLUMN notas.data_prazo_compras IS 'Prazo interno para o setor de compras';

-- ============================================
-- TABLE: itens (Document Items)
-- ============================================

-- 1. marca: Brand of the product as specified in the document
ALTER TABLE itens
ADD COLUMN IF NOT EXISTS marca TEXT;

COMMENT ON COLUMN itens.marca IS 'Marca do produto conforme especificado no documento';

-- ============================================
-- SUMMARY OF FORM FIELDS VS DATABASE COLUMNS
-- ============================================
-- FORM FIELD (CriarNota.tsx)    | DB COLUMN (notas/itens)       | STATUS
-- ------------------------------|-------------------------------|--------
-- numeroNe                      | numero_ne                     | ✓ EXISTS
-- emissor                       | emissor                       | ✓ EXISTS
-- valorTeto                     | valor_total_teto              | ✓ EXISTS
-- tipoDoc                       | tipo_documento                | ✓ EXISTS
-- dataEmissao                   | data_emissao                  | ✓ EXISTS
-- prazoEntrega                  | previsao_entrega              | ✓ EXISTS
-- dataPrazoCompras              | data_prazo_compras            | ✓ ADDED
-- arquivo                       | arquivo_caminho               | ✓ EXISTS
-- item.descricao                | itens.descricao               | ✓ EXISTS
-- item.quantidade               | itens.quantidade              | ✓ EXISTS
-- item.unidade                  | itens.unidade                 | ✓ EXISTS
-- item.valor_unitario           | itens.valor_unitario          | ✓ EXISTS
-- item.marca                    | itens.marca                   | ✓ ADDED
