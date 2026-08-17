-- Add marca (brand) column to itens table
ALTER TABLE itens
ADD COLUMN IF NOT EXISTS marca TEXT;

COMMENT ON COLUMN itens.marca IS 'Marca do produto conforme especificado no documento';
