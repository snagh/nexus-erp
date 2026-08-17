-- Fix: Change previsao_entrega from DATE to TEXT
-- The AI extracts prazo de entrega as text like "30 dias", not a date

ALTER TABLE notas
ALTER COLUMN previsao_entrega TYPE TEXT;

COMMENT ON COLUMN notas.previsao_entrega IS 'Prazo de entrega como texto livre (ex: 30 dias, 15 dias úteis)';
