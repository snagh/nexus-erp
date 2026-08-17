# Arquitetura e Engenharia de Software - Nexus ERP

O **Nexus ERP** é uma plataforma corporativa em nuvem desenvolvida para simplificar e automatizar o ciclo completo de gestão de vendas públicas (licitações, atas de registro de preços e notas de empenho), faturamento, baixas parciais de mercadorias e planejamento de compras com inteligência artificial.

---

## 🏛️ Visão Geral da Arquitetura

O sistema adota uma arquitetura moderna orientada a componentes no frontend com backend desacoplado em modelo **Backend-as-a-Service (BaaS)** e **Edge Computing**.

```mermaid
graph TD
    subgraph Client ["Frontend (SPA React 19 + TypeScript)"]
        UI[Interface Shadcn UI / Radix]
        Router[React Router DOM]
        State[React Query + Context API]
        ClientStorage[Session / Local Storage]
    end

    subgraph Edge ["Supabase & Edge Functions"]
        Auth[Supabase Auth / JWT]
        EdgeFuncs[Edge Functions Deno]
        Storage[Supabase Storage S3]
    end

    subgraph AI ["Google Gemini AI"]
        GeminiFlash[Gemini 2.0 Flash OCR & Parser]
    end

    subgraph DB ["PostgreSQL Database (Supabase)"]
        RLS[Row-Level Security Policies]
        Tables[(Tabelas Relacionais)]
        Triggers[Triggers & Stored Procedures]
        Audit[Audit Logs & Telemetria]
    end

    UI --> Router
    Router --> State
    State --> Auth
    State --> EdgeFuncs
    State --> Storage
    State --> RLS
    EdgeFuncs --> GeminiFlash
    RLS --> Tables
    Tables --> Triggers
    Triggers --> Audit
```

---

## 💻 Tecnologias e Bibliotecas

| Camada | Tecnologia | Função Principal |
| :--- | :--- | :--- |
| **Framework Web** | React 19 + TypeScript | SPA de alta performance com tipagem estática rigorosa. |
| **Bundler & Build** | Vite 8 + Rolldown | HMR ultrarrápido e otimização avançada de chunks. |
| **Estilização** | Tailwind CSS v4 + Shadcn UI | Design System moderno, responsivo e com suporte a Dark Mode. |
| **Banco & Backend** | Supabase (PostgreSQL 15+) | Persistência relacional, autenticação JWT, Storage e RLS. |
| **Motor de IA** | Google Gemini 2.0 Flash | Extração estruturada de PDFs de empenhos, atas e notas fiscais. |
| **Visualização** | Recharts + Lucide Icons | Dashboards analíticos em tempo real e iconografia semântica. |
| **Relatórios / PDF** | jsPDF + pdf-lib + pdfjs-dist | Geração e manipulação de documentos PDF no lado cliente. |

---

## 🛡️ Camada de Segurança e RLS (Row-Level Security)

A aplicação não depende exclusivamente de validações no frontend. Cada consulta e mutação de dados é validada a nível de banco de dados pelo PostgreSQL:

1. **Role-Based Access Control (RBAC)**:
   - **DIREÇÃO / ADMIN**: Acesso integral a todas as operações, logs de auditoria e exclusões com senha mestra.
   - **GESTÃO**: Acesso gerencial a empenhos, compras e cotações.
   - **OPERACIONAL**: Visualização e lançamento de baixas e notas do seu setor/território.
   - **VENDEDOR**: Isolamento estrito de dados (visualiza apenas os empenhos e cotações sob sua titularidade ou território).
2. **Políticas RLS Rigorosas**:
   - `notas_select_policy`, `itens_select_policy`, `pedidos_compra_policy`: Verificam `auth.uid()` e o cargo do perfil antes de retornar qualquer registro.

---

## ⚡ Fluxo de Ingestão de Documentos com Inteligência Artificial

```mermaid
sequenceDiagram
    autonumber
    actor User as Usuário
    participant App as Frontend (React)
    participant Edge as Supabase Edge Function
    participant Gemini as Google Gemini AI
    participant DB as PostgreSQL (Supabase)

    User->>App: Faz upload do PDF do Empenho / Ata
    App->>Edge: Envia arquivo em Base64 / ArrayBuffer
    Edge->>Gemini: Prompt estruturado com schema JSON de saída
    Gemini-->>Edge: Retorna JSON (Órgão, Número, Itens, Unidades, Prazos)
    Edge-->>App: Resposta tipada com os dados extraídos
    App->>User: Exibe pré-visualização e mapeamento inteligente
    User->>App: Revisa e clica em Confirmar
    App->>DB: Executa insert transacional (Nota + Itens)
```
