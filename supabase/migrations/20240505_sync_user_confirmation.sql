-- ============================================================
-- MIGRATION: 20240505_sync_user_confirmation.sql
-- Descrição:
--   Sincroniza o status de confirmação de e-mail da tabela
--   auth.users para a tabela public.profiles.
--   Isso permite que o Painel Admin exiba o status sem
--   precisar de chamadas RPC individuais.
-- ============================================================

-- 1. Adicionar coluna de status na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;

-- 2. Função para sincronizar o status de confirmação
CREATE OR REPLACE FUNCTION public.handle_user_confirmation_sync()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET email_confirmed_at = NEW.email_confirmed_at
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger para monitorar mudanças na tabela auth.users
DROP TRIGGER IF EXISTS on_auth_user_updated_sync_confirmation ON auth.users;
CREATE TRIGGER on_auth_user_updated_sync_confirmation
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_confirmation_sync();

-- 4. Sincronização inicial para usuários existentes
UPDATE public.profiles p
SET email_confirmed_at = u.email_confirmed_at
FROM auth.users u
WHERE p.id = u.id;
