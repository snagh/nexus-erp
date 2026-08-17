# Esquema de Banco de Dados e Entidades - Nexus ERP

O banco de dados do **Nexus ERP** é modelado no **PostgreSQL**, estruturado para suportar relacionamentos complexos entre Atas de Registro de Preços (ARP), Notas de Empenho (NE), Baixas Parciais/Totais, Solicitações de Compras e Cotações.

---

## 📊 Diagrama Entidade-Relacionamento (ERD)

```mermaid
erDiagram
    ENTIDADES ||--o{ NOTAS : "emite"
    ENTIDADES ||--o{ ATAS : "emite"
    ATAS ||--o{ ITENS_ATA : "contém"
    ATAS ||--o{ NOTAS : "origina"
    NOTAS ||--o{ ITENS : "contém"
    ITENS_ATA ||--o{ ITENS : "abate saldo"
    ITENS ||--o{ HISTORICO_ENTREGAS : "recebe baixas"
    ITENS ||--o{ PEDIDOS_COMPRA : "gera demanda"
    ITENS ||--o{ COTACOES_PRIVADO : "origina cotação"
    PROFILES ||--o{ NOTAS : "responsável"
    PROFILES ||--o{ AUDIT_LOGS : "executa ação"

    ENTIDADES {
        bigint id PK
        text nome
        text cnpj
        text tipo_entidade
        text uf
        text municipio
    }

    ATAS {
        bigint id PK
        text numero_ata
        text ano
        text objeto
        date data_vigencia_inicio
        date data_vigencia_fim
        text emissor
        text uf
    }

    ITENS_ATA {
        bigint id PK
        bigint ata_id FK
        integer item_numero
        text descricao
        numeric quantidade_total
        numeric saldo_disponivel
        numeric valor_unitario
        text unidade
    }

    NOTAS {
        bigint id PK
        text numero_ne
        text emissor
        date data_emissao
        date previsao_entrega
        text status
        text tipo_documento
        bigint parent_ata_id FK
        text uf
    }

    ITENS {
        bigint id PK
        bigint nota_id FK
        bigint item_ata_id FK
        text descricao
        numeric quantidade
        numeric valor_unitario
        numeric saldo_pendente
        text status_item
    }

    HISTORICO_ENTREGAS {
        bigint id PK
        bigint item_id FK
        bigint item_ata_id FK
        numeric quantidade_entregue
        timestamptz data_entrega
        text numero_nf
        text motivo_pendencia
    }

    PEDIDOS_COMPRA {
        bigint id PK
        bigint item_id FK
        numeric quantidade_solicitada
        text status
        date data_solicitacao
        date data_limite
    }

    COTACOES_PRIVADO {
        bigint id PK
        text numero_cotacao
        text cliente_nome
        text status
        numeric valor_estimado
    }
```

---

## 🔑 Principais Tabelas e Regras de Negócio

### 1. `notas` (Notas de Empenho)
- Representa o documento formal de empenho emitido pela entidade pública.
- Possui status dinâmico (`PENDENTE`, `PARCIAL`, `ENTREGUE`, `CANCELADO`).
- Controla datas de recebimento, SLA de entrega e alertas de vencimento iminente.

### 2. `itens` (Itens do Empenho)
- Registra a especificação do produto, quantidade empenhada, valor unitário contratado e o `saldo_pendente`.
- Quando vinculado a uma Ata (`item_ata_id`), suas entregas abatem automaticamente o saldo global daquela ata via trigger / RPC.

### 3. `historico_entregas` (Baixas e Recebimentos)
- Armazena cada lançamento de entrega física ou faturamento por Nota Fiscal (NF-e) ou Pedido de Venda (DAV).
- Registra observações de divergência, justificativas de entrega parcial e comprovantes em anexo.

### 4. `pedidos_compra` (Compras & Abastecimento)
- Disparado automaticamente quando um item de empenho possui saldo a entregar que excede o estoque disponível.
- Permite aos compradores agrupar demandas por fornecedor, cotar preços e registrar confirmação de compra com data de entrega prevista pelo fabricante.
