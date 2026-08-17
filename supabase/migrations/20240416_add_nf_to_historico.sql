-- Adiciona colunas para rastreamento de Nota Fiscal nas entregas (baixas)
ALTER TABLE "public"."historico_entregas" 
ADD COLUMN IF NOT EXISTS "numero_nf" TEXT,
ADD COLUMN IF NOT EXISTS "arquivo_nf_caminho" TEXT;
