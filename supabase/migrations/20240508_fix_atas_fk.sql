-- MIGRATION: 20240508_fix_atas_fk.sql
-- Descrição: Ajusta a chave estrangeira de assigned_to para referenciar public.profiles, permitindo joins no PostgREST.

ALTER TABLE public.atas 
  DROP CONSTRAINT IF EXISTS atas_assigned_to_fkey;

ALTER TABLE public.atas
  ADD CONSTRAINT atas_assigned_to_fkey 
  FOREIGN KEY (assigned_to) 
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;
