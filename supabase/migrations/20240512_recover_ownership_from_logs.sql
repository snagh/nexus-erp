-- Script de Recuperação Retroativa de Donos de Registros
-- Tenta encontrar nos logs de auditoria quem criou cada registro e preencher o owner_id caso esteja vazio.

DO $$ 
DECLARE
    affected_entidades INTEGER := 0;
    affected_notas INTEGER := 0;
    rec_count INTEGER;
BEGIN 
    -- 1. NOTAS: Tentar via logs (CREATE) usando user_id para precisão
    WITH creator_logs AS (
        SELECT DISTINCT ON (record_id) 
            record_id, 
            user_id
        FROM public.audit_logs
        WHERE LOWER(table_name) = 'notas' 
          AND action = 'CREATE'
          AND user_id IS NOT NULL
        ORDER BY record_id, created_at ASC
    )
    UPDATE public.notas n
    SET owner_id = l.user_id::uuid
    FROM creator_logs l
    WHERE n.owner_id IS NULL
      AND TRIM(l.record_id) = n.id::text;
    
    GET DIAGNOSTICS rec_count = ROW_COUNT;
    affected_notas := affected_notas + rec_count;

    -- 2. NOTAS: Tentar via logs (CREATE) usando email (case-insensitive) como backup
    WITH creator_logs AS (
        SELECT DISTINCT ON (record_id) 
            record_id, 
            user_email
        FROM public.audit_logs
        WHERE LOWER(table_name) = 'notas' 
          AND action = 'CREATE'
          AND user_email IS NOT NULL
        ORDER BY record_id, created_at ASC
    )
    UPDATE public.notas n
    SET owner_id = p.id
    FROM creator_logs l
    JOIN public.profiles p ON LOWER(p.email) = LOWER(l.user_email)
    WHERE n.owner_id IS NULL
      AND TRIM(l.record_id) = n.id::text;

    GET DIAGNOSTICS rec_count = ROW_COUNT;
    affected_notas := affected_notas + rec_count;

    -- 3. ENTIDADES: Tentar via logs diretos (CREATE) se houver
    WITH creator_logs AS (
        SELECT DISTINCT ON (record_id) 
            record_id, 
            user_id
        FROM public.audit_logs
        WHERE LOWER(table_name) = 'entidades' 
          AND action = 'CREATE'
        ORDER BY record_id, created_at ASC
    )
    UPDATE public.entidades e
    SET owner_id = l.user_id::uuid
    FROM creator_logs l
    WHERE e.owner_id IS NULL
      AND TRIM(l.record_id) = e.id::text;

    GET DIAGNOSTICS rec_count = ROW_COUNT;
    affected_entidades := affected_entidades + rec_count;

    -- 4. FALLBACK ENTIDADES: Usar o owner da primeira nota vinculada a esta entidade
    -- Lógica: Se não temos log de quem criou a entidade, assumimos que quem cadastrou
    -- o primeiro empenho (nota) para ela foi o seu "dono".
    WITH first_nota AS (
        SELECT DISTINCT ON (entidade_id)
            entidade_id,
            owner_id
        FROM public.notas
        WHERE entidade_id IS NOT NULL 
          AND owner_id IS NOT NULL
        ORDER BY entidade_id, created_at ASC
    )
    UPDATE public.entidades e
    SET owner_id = fn.owner_id
    FROM first_nota fn
    WHERE e.id = fn.entidade_id
      AND e.owner_id IS NULL;

    GET DIAGNOSTICS rec_count = ROW_COUNT;
    affected_entidades := affected_entidades + rec_count;

    RAISE NOTICE 'Recuperação concluída: % entidades e % notas atualizadas.', affected_entidades, affected_notas;
END $$;
