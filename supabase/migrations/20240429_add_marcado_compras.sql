-- Adicionar campo marcado_compras na tabela de notas
ALTER TABLE public.notas
ADD COLUMN IF NOT EXISTS marcado_compras boolean DEFAULT false;

-- Adicionar campo marcado_compras na tabela de itens
ALTER TABLE public.itens
ADD COLUMN IF NOT EXISTS marcado_compras boolean DEFAULT false;
