-- Run as superuser (e.g. postgres) inside Docker or via psql.
-- Only needed if the app connects as a limited user (e.g. guardy_user) after tables exist.
-- TypeORM synchronize creates tables on first app start when using a user with DDL rights.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'guardy_user') THEN
    GRANT ALL ON SCHEMA public TO guardy_user;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO guardy_user;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO guardy_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO guardy_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO guardy_user;
  END IF;
END
$$;
