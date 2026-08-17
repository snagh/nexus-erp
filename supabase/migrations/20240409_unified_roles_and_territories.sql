-- MIGRATION: 20240409_unified_roles_and_territories.sql
-- Description: Updates profiles, entities, and items for the new modular system.

-- 1. ENUMS (Para garantir integridade)
DO $$ BEGIN
    CREATE TYPE user_setor AS ENUM ('COMPRAS', 'VENDAS', 'EMPENHOS', 'DIRECAO', 'LOGISTICA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_nivel AS ENUM ('OP', 'ADM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE item_categoria AS ENUM ('INSUMO', 'MEDICAMENTOS', 'ODONTO', 'MOBILIARIO', 'ELETRONICOS_INFORMATICA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. UPDATE PROFILES
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS setor user_setor DEFAULT 'EMPENHOS',
ADD COLUMN IF NOT EXISTS nivel user_nivel DEFAULT 'OP';

-- 3. UPDATE ENTIDADES (Territórios)
ALTER TABLE entidades
ADD COLUMN IF NOT EXISTS regiao TEXT,
ADD COLUMN IF NOT EXISTS municipio TEXT;
-- 'estado' já existe via supabaseHelpers, garantindo existência
ALTER TABLE entidades ADD COLUMN IF NOT EXISTS estado TEXT;

-- 4. UPDATE NOTAS (Sistema de Cargas)
ALTER TABLE notas
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS distributed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_carga TEXT DEFAULT 'AGUARDANDO',
ADD COLUMN IF NOT EXISTS entidade_id INTEGER REFERENCES entidades(id);

-- 5. UPDATE ITENS (Categorias)
ALTER TABLE itens
ADD COLUMN IF NOT EXISTS categoria TEXT;

ALTER TABLE itens_ata
ADD COLUMN IF NOT EXISTS categoria TEXT;

-- Comentário: Usaremos TEXT para maior flexibilidade na IA, 
-- mas seguindo os ENUMs definidos no prompt.

-- 6. INDEXES PARA DASHBOARD (Performance)
CREATE INDEX IF NOT EXISTS idx_entidades_territorio ON entidades(regiao, estado, municipio);
CREATE INDEX IF NOT EXISTS idx_notas_assignment ON notas(assigned_to, status_carga);
