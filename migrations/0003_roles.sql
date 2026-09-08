-- Roles.
--
-- Access control now lives in application code (requireAdmin in
-- src/lib/ravi/auth.server.ts), not in RLS policies: only the server holds
-- database credentials, and no browser ever talks to Postgres directly.
-- The has_role() SECURITY DEFINER function from the Supabase schema is
-- therefore gone; assertAdmin() queries this table instead.

DO $$
BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS user_roles_user_idx ON user_roles(user_id);
