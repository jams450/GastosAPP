-- Existing deployments require this migration; schema.sql only applies to new databases.
ALTER TABLE public.users
    ALTER COLUMN admin SET DEFAULT FALSE;
