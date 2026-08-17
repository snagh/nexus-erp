-- ============================================================
-- CORREÇÃO: Restaura campo 'emissor' das notas do FMS Teresina - PI
-- cadastradas hoje (2026-04-16) que ficaram com emissor vazio
-- devido ao bug do dropdown.
-- 
-- INSTRUÇÕES:
-- 1. Execute primeiro o SELECT de diagnóstico para confirmar os registros
-- 2. Se os dados estiverem corretos, execute o UPDATE
-- 3. Confirme o resultado com o SELECT final
-- ============================================================

-- PASSO 1: Diagnóstico — ver quais notas serão afetadas
SELECT 
    n.id,
    n.numero_ne,
    n.emissor,
    n.entidade_id,
    e.nome AS entidade_nome,
    n.created_at
FROM notas n
LEFT JOIN entidades e ON e.id = n.entidade_id
WHERE 
    n.created_at::date = '2026-04-16'
    AND (n.emissor IS NULL OR TRIM(n.emissor) = '')
    AND n.entidade_id IS NOT NULL
ORDER BY n.created_at DESC;

-- ============================================================
-- PASSO 2: UPDATE — preenche o emissor com o nome da entidade vinculada
-- (só executa após confirmar o SELECT acima)
-- ============================================================
UPDATE notas n
SET emissor = e.nome
FROM entidades e
WHERE 
    n.entidade_id = e.id
    AND n.created_at::date = '2026-04-16'
    AND (n.emissor IS NULL OR TRIM(n.emissor) = '');

-- ============================================================
-- PASSO 3: Confirmação
-- ============================================================
SELECT id, numero_ne, emissor, created_at
FROM notas
WHERE created_at::date = '2026-04-16'
ORDER BY created_at DESC;
