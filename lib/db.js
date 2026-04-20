/**
 * lib/db.js — Postgres client
 *
 * Exports a single `pg.Pool` instance. Used by:
 *   - auth.js (via @auth/pg-adapter)
 *   - app/api/admin/* routes
 *   - app/api/cas/* routes
 *
 * POSTGRES_URL is set automatically by Vercel Postgres integration.
 * ssl: { rejectUnauthorized: false } is required for Neon (Vercel Postgres).
 */

import pg from 'pg';

const { Pool } = pg;

// Reuse the pool across hot-reloads in development
const globalPool = globalThis.__pgPool;

const pool = globalPool ?? new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.__pgPool = pool;
}

export default pool;
