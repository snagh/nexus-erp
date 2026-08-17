-- Frente 1: Coluna objeto_ata na tabela atas
ALTER TABLE atas ADD COLUMN IF NOT EXISTS objeto_ata TEXT DEFAULT NULL;

-- Frente 3: Tabela de DAVs para registro/cadastro de entregas
CREATE TABLE IF NOT EXISTS davs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_dav TEXT NOT NULL,
  data_emissao DATE,
  owner_id UUID REFERENCES auth.users(id),
  entidade_id UUID REFERENCES entidades(id),   -- UUID conforme banco real
  ata_id UUID REFERENCES atas(id),
  nota_id INTEGER REFERENCES notas(id),        -- INTEGER conforme schema
  valor_total NUMERIC(12,2) DEFAULT 0,
  arquivo_caminho TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itens_dav (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dav_id UUID REFERENCES davs(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  quantidade NUMERIC(10,3) DEFAULT 0,
  unidade TEXT,
  valor_unitario NUMERIC(12,4) DEFAULT 0,
  valor_total NUMERIC(12,2) DEFAULT 0,
  codigo_item TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para davs
ALTER TABLE davs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendedor vê apenas seus DAVs" ON davs;
CREATE POLICY "Vendedor vê apenas seus DAVs" ON davs
  FOR ALL USING (
    owner_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND nivel IN ('ADM', 'DEV')
    )
  );

ALTER TABLE itens_dav ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendedor vê itens de seus DAVs" ON itens_dav;
CREATE POLICY "Vendedor vê itens de seus DAVs" ON itens_dav
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM davs d
      WHERE d.id = dav_id AND (
        d.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND nivel IN ('ADM', 'DEV')
        )
      )
    )
  );

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_davs_owner ON davs(owner_id);
CREATE INDEX IF NOT EXISTS idx_davs_ata ON davs(ata_id);
CREATE INDEX IF NOT EXISTS idx_davs_nota ON davs(nota_id);
CREATE INDEX IF NOT EXISTS idx_itens_dav_dav ON itens_dav(dav_id);
