DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'polyadmin') THEN
      CREATE ROLE polyadmin WITH LOGIN PASSWORD 'krakovskiiadmin2026';
   END IF;
END
$$;

DO
$$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'telemetry') THEN
      CREATE DATABASE telemetry OWNER polyadmin;
   END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE telemetry TO polyadmin;