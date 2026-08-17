-- Adicionar coluna foi_notificado na tabela notas
ALTER TABLE notas ADD COLUMN IF NOT EXISTS foi_notificado BOOLEAN DEFAULT FALSE;

-- Sincronizar dados existentes: se já está marcado como notificado ativa,
-- historicamente também foi notificado.
UPDATE notas SET foi_notificado = TRUE WHERE e_notificacao = TRUE;
