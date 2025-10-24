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

console.log('=== DATABASE CONNECTION VERIFICATION ===');
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
console.log('PGHOST (should be undefined):', process.env.PGHOST);
console.log('PGUSER (should be undefined):', process.env.PGUSER);
console.log('PGPASSWORD (should be undefined):', process.env.PGPASSWORD ? '[REDACTED]' : undefined);
console.log('PGDATABASE (should be undefined):', process.env.PGDATABASE);
console.log('PGPORT (should be undefined):', process.env.PGPORT);

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

console.log('Parsed connection config:');
console.log('  Host:', connectionConfig.host);
console.log('  Port:', connectionConfig.port);
console.log('  Database:', connectionConfig.database);
console.log('  User:', connectionConfig.user);
console.log('========================================');

// Create pool with explicit parameters - this overrides PG* env vars like PGHOST
export const pool = new Pool(connectionConfig);

export const db = drizzle({ client: pool, schema });
