# Guia de Seed e Dados de Demonstração - Nexus ERP

O arquivo [`supabase/seed.sql`](../supabase/seed.sql) contém um conjunto completo de dados simulados (prefeituras fictícias, medicamentos padrão Anvisa, atas de registro de preços, empenhos em aberto e cotações de teste) para que você possa testar 100% das funcionalidades do sistema localmente ou em uma instância de testes.

---

## 🚀 Como Aplicar o Seed no seu Supabase

### Opção 1: Via Painel Web do Supabase (SQL Editor)
1. Acesse o seu painel do Supabase em [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Abra o menu **SQL Editor** na barra lateral.
3. Copie o conteúdo do arquivo [`supabase/seed.sql`](../supabase/seed.sql) e cole no editor.
4. Clique em **Run** para executar.

---

### Opção 2: Via Supabase CLI (Ambiente Local)
Se você estiver utilizando o Supabase localmente com Docker:

```bash
# Iniciar o Supabase local
npx supabase start

# Aplicar as migrações e o seed
npx supabase db reset
```

---

## 👤 Perfis de Teste Criados pelo Seed

Ao rodar o seed, o sistema criará as seguintes estruturas de demonstração:

| Cargo / Nível | Permissões | Utilidade de Teste |
| :--- | :--- | :--- |
| **DIRECAO** | Total (Admin + Auditoria + Exclusões) | Testar painel de configurações, auditoria e aprovação de usuários. |
| **GESTAO** | Gestão de Empenhos e Compras | Testar fluxo completo de compras, relatórios e controle de entregas. |
| **OPERACIONAL** | Lançamento de Baixas e Documentos | Testar importação de XML/NF e baixa provisória por pedidos (DAV). |
| **VENDEDOR** | Isolado ao seu território | Testar a segurança RLS e cotações privadas exclusivas. |
