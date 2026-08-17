-- Adiciona campo subcategoria na tabela itens_ata e itens
ALTER TABLE itens_ata ADD COLUMN IF NOT EXISTS subcategoria TEXT;
ALTER TABLE itens ADD COLUMN IF NOT EXISTS subcategoria TEXT;
