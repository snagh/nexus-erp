-- Adiciona coluna de data de emissão da NF no histórico de entregas
ALTER TABLE "public"."historico_entregas" 
ADD COLUMN IF NOT EXISTS "data_emissao_nf" DATE;

COMMENT ON COLUMN "public"."historico_entregas"."data_emissao_nf" IS 'Data de emissão oficial impressa na Nota Fiscal';
