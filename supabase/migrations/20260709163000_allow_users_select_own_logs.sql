-- Migration: 20260709163000_allow_users_select_own_logs.sql
-- Descrição: Adiciona política de RLS para que usuários possam ler/selecionar seus próprios logs de uso em public.usage_logs.

CREATE POLICY "users_own_logs_select" ON public.usage_logs
  FOR SELECT USING (auth.uid() = user_id);
