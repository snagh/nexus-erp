-- Adiciona chaves estrangeiras para rastreabilidade de quem cadastrou os registros

-- 1. Garantir FK em Entidades
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entidades_owner_id_fkey') THEN
        ALTER TABLE public.entidades 
        ADD CONSTRAINT entidades_owner_id_fkey 
        FOREIGN KEY (owner_id) REFERENCES public.profiles(id);
    END IF;
END $$;

COMMENT ON COLUMN public.entidades.owner_id IS 'ID do usuário que cadastrou a entidade pela primeira vez';

-- 2. Garantir FK em Notas (Empenhos)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notas_owner_id_fkey') THEN
        ALTER TABLE public.notas 
        ADD CONSTRAINT notas_owner_id_fkey 
        FOREIGN KEY (owner_id) REFERENCES public.profiles(id);
    END IF;
END $$;

COMMENT ON COLUMN public.notas.owner_id IS 'ID do usuário que realizou o cadastro ou importação do empenho';

-- 3. (Opcional) Poderíamos também rastrear em ATAs se necessário, mas o usuário pediu especificamente Entidades e Empenhos.
-- Já que estamos aqui, vamos garantir a de ATAs também para consistência futura
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'atas_owner_id_fkey') THEN
        ALTER TABLE public.atas 
        ADD CONSTRAINT atas_owner_id_fkey 
        FOREIGN KEY (owner_id) REFERENCES public.profiles(id);
    END IF;
END $$;
