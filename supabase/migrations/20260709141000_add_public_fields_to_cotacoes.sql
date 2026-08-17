-- Migration: 20260709141000_add_public_fields_to_cotacoes.sql
-- Descrição: Adiciona colunas de vendas públicas (categoria, cliente, documento_origem, tipo_documento) à tabela cotacoes_privado e atualiza status antigos.

ALTER TABLE public.cotacoes_privado 
ADD COLUMN IF NOT EXISTS categoria VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS cliente VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS documento_origem VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(255) NULL;

COMMENT ON COLUMN public.cotacoes_privado.categoria IS 'Categoria do produto (MEDICAMENTO, ODONTO, etc.)';
COMMENT ON COLUMN public.cotacoes_privado.cliente IS 'Nome do cliente / órgão solicitante';
COMMENT ON COLUMN public.cotacoes_privado.documento_origem IS 'Número do empenho / ordem / ata / etc.';
COMMENT ON COLUMN public.cotacoes_privado.tipo_documento IS 'Tipo de documento de origem';

-- Atualiza dados de COMPRADO para COTADO
UPDATE public.cotacoes_privado 
SET comprou_status = REPLACE(comprou_status, 'COMPRADO - ', 'COTADO - ') 
WHERE comprou_status LIKE 'COMPRADO - %';
