-- Criação de índices de chaves estrangeiras cruciais para performance de Joins e RLS
-- que estavam causando lentidão extrema na listagem de empenhos e dashboard.

-- 1. Índice na FK de itens apontando para notas (otimiza o join de empenhos -> itens)
CREATE INDEX IF NOT EXISTS idx_itens_nota_id ON public.itens(nota_id);

-- 2. Índice na FK de historico_entregas apontando para itens (otimiza o join de itens -> entregas)
CREATE INDEX IF NOT EXISTS idx_historico_entregas_item_id ON public.historico_entregas(item_id);

-- 3. Índice na FK de pedidos_compra apontando para itens (otimiza o join de compras -> itens)
CREATE INDEX IF NOT EXISTS idx_pedidos_compra_item_id ON public.pedidos_compra(item_id);

-- 4. Índice na FK de notas apontando para entidades (otimiza o join de empenhos -> prefeituras)
CREATE INDEX IF NOT EXISTS idx_notas_entidade_id ON public.notas(entidade_id);

-- 5. Índice na FK de notas apontando para owner_id (otimiza as políticas de RLS e restrições de usuário)
CREATE INDEX IF NOT EXISTS idx_notas_owner_id ON public.notas(owner_id);
