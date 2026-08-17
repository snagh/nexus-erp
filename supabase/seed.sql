-- ==============================================================================
-- NEXUS ERP - SEED DE DADOS FICTÍCIOS DE DEMONSTRAÇÃO (SHOWCASE / PORTFÓLIO)
-- ==============================================================================
-- Este script popula o banco com dados simulados para testes locais ou homologação.
-- NENHUM dado confidencial, real ou de terceiros está presente neste arquivo.

-- 1. Permissões e Cargos Base (RBAC)
INSERT INTO public.cargos_permissoes (id, nome, permissoes)
VALUES 
  (1, 'DIRECAO', '{"admin": true, "gestao_empenhos": true, "gestao_compras": true, "cotacoes": true, "auditoria": true}'::jsonb),
  (2, 'GESTAO', '{"admin": false, "gestao_empenhos": true, "gestao_compras": true, "cotacoes": true, "auditoria": false}'::jsonb),
  (3, 'OPERACIONAL', '{"admin": false, "gestao_empenhos": true, "gestao_compras": false, "cotacoes": true, "auditoria": false}'::jsonb),
  (4, 'VENDEDOR', '{"admin": false, "gestao_empenhos": false, "gestao_compras": false, "cotacoes": true, "auditoria": false}'::jsonb)
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, permissoes = EXCLUDED.permissoes;

-- 2. Entidades Públicas Fictícias (Prefeituras e Órgãos de Saúde Simulados)
INSERT INTO public.entidades (id, nome, cnpj, tipo_entidade, uf, municipio)
VALUES
  (101, 'PREFEITURA MUNICIPAL DE VALE DO SOL', '00.000.000/0001-91', 'PREFEITURA', 'MT', 'Vale do Sol'),
  (102, 'FUNDO MUNICIPAL DE SAUDE DE NOVO HORIZONTE', '00.000.000/0001-92', 'FUNDO_SAUDE', 'SP', 'Novo Horizonte'),
  (103, 'SECRETARIA DE ESTADO DE SAUDE - MODELO', '00.000.000/0001-93', 'ESTADUAL', 'PR', 'Curitiba'),
  (104, 'HOSPITAL REGIONAL DAS FLORES', '00.000.000/0001-94', 'HOSPITAL', 'MG', 'Belo Horizonte')
ON CONFLICT (id) DO NOTHING;

-- 3. Catálogo de Produtos e Insumos Médicos / Hospitalares Simulados
INSERT INTO public.catalogo_produtos (id, codigo_catalogo, descricao, unidade_padrao, categoria, subcategoria, preco_referencia)
VALUES
  (1, 'MED-001', 'DIPIRONA SODICA 500MG/ML SOLUCAO INJETAVEL 2ML', 'AMPOLA', 'MEDICAMENTOS', 'ANALGESICOS', 1.85),
  (2, 'MED-002', 'PARACETAMOL 500MG COMPRIMIDO', 'COMPRIMIDO', 'MEDICAMENTOS', 'ANALGESICOS', 0.25),
  (3, 'MED-003', 'AMOXICILINA + CLAVULANATO DE POTASSIO 500MG + 125MG', 'COMPRIMIDO', 'MEDICAMENTOS', 'ANTIBIOTICOS', 3.40),
  (4, 'MAT-001', 'SERINGA DESCARTAVEL 5ML COM AGULHA 25X7 (CX C/ 100)', 'CAIXA', 'MATERIAIS', 'DESCARTAVEIS', 45.00),
  (5, 'MAT-002', 'LUVA DE PROCEDIMENTO CIRURGICO TAMANHO M (CX C/ 100)', 'CAIXA', 'MATERIAIS', 'EPI', 32.50)
ON CONFLICT (id) DO NOTHING;

-- 4. Atas de Registro de Preços (ARP) Fictícias
INSERT INTO public.atas (id, numero_ata, ano, objeto, data_vigencia_inicio, data_vigencia_fim, emissor, uf, created_at)
VALUES
  (501, '042/2026', '2026', 'REGISTRO DE PRECOS PARA AQUISICAO DE MEDICAMENTOS BASICOS E ESSENCIAIS', '2026-01-10', '2027-01-09', 'PREFEITURA MUNICIPAL DE VALE DO SOL', 'MT', NOW()),
  (502, '118/2026', '2026', 'AQUISICAO ESTIMADA DE MATERIAIS HOSPITALARES E DESCARTAVEIS', '2026-03-01', '2027-02-28', 'FUNDO MUNICIPAL DE SAUDE DE NOVO HORIZONTE', 'SP', NOW())
ON CONFLICT (id) DO NOTHING;

-- 5. Itens da Ata de Registro de Preços
INSERT INTO public.itens_ata (id, ata_id, item_numero, descricao, quantidade_total, saldo_disponivel, valor_unitario, unidade, produto_catalogo_id)
VALUES
  (5001, 501, 1, 'DIPIRONA SODICA 500MG/ML SOLUCAO INJETAVEL 2ML', 50000, 35000, 1.85, 'AMPOLA', 1),
  (5002, 501, 2, 'PARACETAMOL 500MG COMPRIMIDO', 100000, 78000, 0.25, 'COMPRIMIDO', 2),
  (5003, 501, 3, 'AMOXICILINA + CLAVULANATO 500MG + 125MG COMPRIMIDO', 20000, 12000, 3.40, 'COMPRIMIDO', 3),
  (5004, 502, 1, 'SERINGA DESCARTAVEL 5ML COM AGULHA 25X7 (CX C/ 100)', 1500, 950, 45.00, 'CAIXA', 4),
  (5005, 502, 2, 'LUVA DE PROCEDIMENTO CIRURGICO TAMANHO M (CX C/ 100)', 2000, 1400, 32.50, 'CAIXA', 5)
ON CONFLICT (id) DO NOTHING;

-- 6. Notas de Empenho (NE) Fictícias
INSERT INTO public.notas (id, numero_ne, emissor, data_emissao, previsao_entrega, status, tipo_documento, parent_ata_id, uf, valor_total)
VALUES
  (1001, '2026NE00142', 'PREFEITURA MUNICIPAL DE VALE DO SOL', '2026-08-01', '2026-08-30', 'PARCIAL', 'EMPENHO', 501, 'MT', 27750.00),
  (1002, '2026NE00589', 'FUNDO MUNICIPAL DE SAUDE DE NOVO HORIZONTE', '2026-08-05', '2026-09-04', 'PENDENTE', 'EMPENHO', 502, 'SP', 15750.00),
  (1003, '2026NE00994', 'HOSPITAL REGIONAL DAS FLORES', '2026-07-20', '2026-08-19', 'ENTREGUE', 'EMPENHO', NULL, 'MG', 6800.00)
ON CONFLICT (id) DO NOTHING;

-- 7. Itens do Empenho
INSERT INTO public.itens (id, nota_id, item_ata_id, item_numero, descricao, quantidade, valor_unitario, valor_total, unidade, saldo_pendente, status_item)
VALUES
  (10001, 1001, 5001, 1, 'DIPIRONA SODICA 500MG/ML SOLUCAO INJETAVEL 2ML', 15000, 1.85, 27750.00, 'AMPOLA', 5000, 'PARCIAL'),
  (10002, 1002, 5004, 1, 'SERINGA DESCARTAVEL 5ML COM AGULHA 25X7 (CX C/ 100)', 350, 45.00, 15750.00, 'CAIXA', 350, 'PENDENTE'),
  (10003, 1003, NULL, 1, 'AMOXICILINA + CLAVULANATO 500MG + 125MG COMPRIMIDO', 2000, 3.40, 6800.00, 'COMPRIMIDO', 0, 'ENTREGUE')
ON CONFLICT (id) DO NOTHING;

-- 8. Histórico de Entregas e Baixas Realizadas
INSERT INTO public.historico_entregas (id, item_id, item_ata_id, quantidade_entregue, data_entrega, numero_nf, motivo_pendencia)
VALUES
  (1, 10001, 5001, 10000, '2026-08-10 14:30:00+00', 'NF-e 004921', 'Entrega da 1ª remessa aprovada pelo almoxarifado central'),
  (2, 10003, NULL, 2000, '2026-08-02 10:15:00+00', 'NF-e 004810', 'Entrega total concluída com ateste')
ON CONFLICT (id) DO NOTHING;

-- 9. Solicitações de Compra em Aberto (Módulo de Compras & Suprimentos)
INSERT INTO public.pedidos_compra (id, item_id, quantidade_solicitada, status, observacoes, data_solicitacao)
VALUES
  (1, 10001, 5000, 'SOLICITADO', 'Reposição para atendimento do saldo restante do Empenho 2026NE00142', '2026-08-11'),
  (2, 10002, 350, 'COTACAO', 'Solicitação aberta automaticamente para compra com fornecedor de seringas', '2026-08-06')
ON CONFLICT (id) DO NOTHING;

-- 10. Cotações Privadas Simuladas (Marketplace & Compras)
INSERT INTO public.cotacoes_privado (id, numero_cotacao, cliente_nome, documento_cliente, status, canal, prazo_dias, valor_estimado, observacoes)
VALUES
  (1, 'COT-2026-0089', 'Clinica Medica Modelo Ltda', '00.000.000/0001-00', 'EM_ANDAMENTO', 'EMAIL', 5, 8450.00, 'Cotação de antibióticos e descartáveis para estoque mensal'),
  (2, 'COT-2026-0090', 'Hospital Santa Clara', '00.000.000/0001-01', 'CONCLUIDA', 'PORTAL', 3, 19200.00, 'Atendimento emergencial de seringas e agulhas')
ON CONFLICT (id) DO NOTHING;
