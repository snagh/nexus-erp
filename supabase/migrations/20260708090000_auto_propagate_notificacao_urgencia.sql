-- Migration: Auto propagate e_notificacao and demanda_judicial flags from notas (empenhos) to pedidos_compra
-- Path: supabase/migrations/20260708090000_auto_propagate_notificacao_urgencia.sql

-- 1. Create or replace propagation function (For UPDATEs on notas)
CREATE OR REPLACE FUNCTION propagate_nota_flags_to_pedidos()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.pedidos_compra
  SET 
    e_notificacao = NEW.e_notificacao,
    arquivo_notificacao = NEW.arquivo_notificacao,
    demanda_judicial = NEW.demanda_judicial,
    arquivo_demanda_judicial = NEW.arquivo_demanda_judicial
  WHERE item_id IN (
    SELECT id FROM public.itens WHERE nota_id = NEW.id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Bind propagation trigger to notas table
DROP TRIGGER IF EXISTS trg_propagate_nota_flags_to_pedidos ON public.notas;
CREATE TRIGGER trg_propagate_nota_flags_to_pedidos
AFTER UPDATE OF e_notificacao, arquivo_notificacao, demanda_judicial, arquivo_demanda_judicial
ON public.notas
FOR EACH ROW
EXECUTE FUNCTION propagate_nota_flags_to_pedidos();

-- 3. Create or replace inheritance function (For INSERTs on pedidos_compra)
CREATE OR REPLACE FUNCTION inherit_nota_flags_on_pedido_insert()
RETURNS TRIGGER AS $$
DECLARE
  parent_nota_id bigint;
  notif_flag boolean;
  notif_file varchar;
  judicial_flag boolean;
  judicial_file varchar;
BEGIN
  IF NEW.item_id IS NOT NULL THEN
    -- Find parent empenho (nota_id) from the items table
    SELECT 
      nota_id INTO parent_nota_id
    FROM public.itens
    WHERE id = NEW.item_id;

    IF parent_nota_id IS NOT NULL THEN
      -- Select current flags from the parent empenho
      SELECT 
        COALESCE(e_notificacao, FALSE), 
        arquivo_notificacao, 
        COALESCE(demanda_judicial, FALSE), 
        arquivo_demanda_judicial
      INTO 
        notif_flag, 
        notif_file, 
        judicial_flag, 
        judicial_file
      FROM public.notas
      WHERE id = parent_nota_id;

      -- Apply flags to the new purchase request if active in parent
      IF notif_flag = TRUE THEN
        NEW.e_notificacao := TRUE;
        NEW.arquivo_notificacao := notif_file;
      END IF;
      
      IF judicial_flag = TRUE THEN
        NEW.demanda_judicial := TRUE;
        NEW.arquivo_demanda_judicial := judicial_file;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Bind inheritance trigger to pedidos_compra table
DROP TRIGGER IF EXISTS trg_inherit_nota_flags_on_pedido_insert ON public.pedidos_compra;
CREATE TRIGGER trg_inherit_nota_flags_on_pedido_insert
BEFORE INSERT
ON public.pedidos_compra
FOR EACH ROW
EXECUTE FUNCTION inherit_nota_flags_on_pedido_insert();
