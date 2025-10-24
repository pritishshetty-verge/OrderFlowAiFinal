// CRITICAL: Delete Replit auto-generated PG* variables FIRST
// This prevents them from overriding our explicit DATABASE_URL parsing
delete process.env.PGHOST;
delete process.env.PGPORT;
delete process.env.PGUSER;
delete process.env.PGPASSWORD;
delete process.env.PGDATABASE;

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

// Parse DATABASE_URL explicitly to extract connection details
// This ensures we use the correct Neon database, not Replit's auto-generated values
const parseDatabaseUrl = (url: string) => {
  const parsed = new URL(url);
  
  // Extract all connection details explicitly
  const config = {
    host: parsed.hostname,
    port: parseInt(parsed.port || '5432'),
    database: parsed.pathname.slice(1).split('?')[0],
    user: parsed.username,
    password: parsed.password,
    ssl: { rejectUnauthorized: false }, // Neon requires SSL
  };
  
  console.log('Database connection config:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    passwordLength: config.password?.length || 0,
    ssl: config.ssl,
  });
  
  return config;
};

const connectionConfig = parseDatabaseUrl(process.env.DATABASE_URL);

// Create pool with EXPLICIT connection config
// By passing an object with explicit host/port/user/password/database,
// we completely bypass any PG* environment variables
export const pool = new Pool(connectionConfig);

export const db = drizzle({ client: pool, schema });
