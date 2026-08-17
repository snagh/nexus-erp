-- Adiciona campo subcategoria na tabela atas
ALTER TABLE atas ADD COLUMN IF NOT EXISTS subcategoria TEXT;
