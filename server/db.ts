import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// IMPORTANT: Parse DATABASE_URL explicitly to override individual PG* environment variables
// This prevents PGHOST=helium from interfering with the connection
const parseDatabaseUrl = (url: string) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '5432'),
    database: parsed.pathname.slice(1).split('?')[0],
    user: parsed.username,
    password: parsed.password,
    ssl: parsed.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : undefined,
  };
};

const connectionConfig = parseDatabaseUrl(process.env.DATABASE_URL);

// Create pool with explicit parameters - this overrides PG* env vars like PGHOST
export const pool = new Pool(connectionConfig);

export const db = drizzle({ client: pool, schema });
