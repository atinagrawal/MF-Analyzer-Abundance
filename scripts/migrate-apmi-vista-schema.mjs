/**
 * scripts/migrate-apmi-vista-schema.mjs
 *
 * Creates the PostgreSQL tables for APMI VISTA (SEBI Monthly PMS Compliance Reports):
 *   - pms_providers
 *   - pms_provider_monthly_snapshots
 *   - pms_sync_state
 *
 * Usage:
 *   node scripts/migrate-apmi-vista-schema.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Auto-load .env.local if POSTGRES_URL is not already set in environment
if (!process.env.POSTGRES_URL) {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('POSTGRES_URL=')) {
        process.env.POSTGRES_URL = line.slice('POSTGRES_URL='.length).trim().replace(/^["']|["']$/g, '');
        break;
      }
    }
  }
}

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('[migrate-apmi-vista] FATAL: POSTGRES_URL environment variable is required.');
  process.exit(1);
}

async function run() {
  console.log('=== Running APMI VISTA Schema Migration ===');
  
  let client = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      client = new pg.Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
      await client.connect();
      break;
    } catch (e) {
      if (client) { try { await client.end(); } catch (_) {} }
      console.warn(`[Connection attempt ${attempt} failed: ${e.message} - waiting 2s...]`);
      if (attempt === 5) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  try {
    console.log('[1/3] Creating pms_providers table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS pms_providers (
        id SERIAL PRIMARY KEY,
        registration_no VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        normalized_slug VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50),
        first_seen_month VARCHAR(7),
        latest_month VARCHAR(7),
        latest_aum_cr NUMERIC(14, 2),
        latest_clients INT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pms_providers_slug ON pms_providers(normalized_slug);
      CREATE INDEX IF NOT EXISTS idx_pms_providers_aum ON pms_providers(latest_aum_cr DESC);
    `);

    console.log('[2/3] Creating pms_provider_monthly_snapshots table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS pms_provider_monthly_snapshots (
        id SERIAL PRIMARY KEY,
        registration_no VARCHAR(50) REFERENCES pms_providers(registration_no) ON DELETE CASCADE,
        month_id VARCHAR(7) NOT NULL,
        month_label VARCHAR(50) NOT NULL,

        -- AUM Breakdown (in INR Crores)
        grand_total_aum NUMERIC(14, 2) NOT NULL,
        aum_discretionary NUMERIC(14, 2) DEFAULT 0,
        aum_non_discretionary NUMERIC(14, 2) DEFAULT 0,
        aum_advisory NUMERIC(14, 2) DEFAULT 0,
        aum_co_investment NUMERIC(14, 2) DEFAULT 0,

        -- Client Counts
        clients_total INT NOT NULL,
        clients_discretionary INT DEFAULT 0,
        clients_non_discretionary INT DEFAULT 0,
        clients_advisory INT DEFAULT 0,
        clients_co_investment INT DEFAULT 0,
        clients_domestic INT DEFAULT 0,
        clients_foreign INT DEFAULT 0,

        -- EPFO / Provident Fund Mandates (added in v2.1.0)
        aum_pf_epfo NUMERIC(14, 2) DEFAULT 0,
        clients_pf_epfo INT DEFAULT 0,

        -- Asset Class Allocation (Combined Discretionary + Non-Discretionary)
        aum_equity_listed NUMERIC(14, 2) DEFAULT 0,
        aum_equity_unlisted NUMERIC(14, 2) DEFAULT 0,
        aum_plain_debt_listed NUMERIC(14, 2) DEFAULT 0,
        aum_plain_debt_unlisted NUMERIC(14, 2) DEFAULT 0,
        aum_struct_debt_listed NUMERIC(14, 2) DEFAULT 0,
        aum_struct_debt_unlisted NUMERIC(14, 2) DEFAULT 0,
        aum_derivatives NUMERIC(14, 2) DEFAULT 0,
        aum_mutual_funds NUMERIC(14, 2) DEFAULT 0,
        aum_others NUMERIC(14, 2) DEFAULT 0,

        -- Flows & Trading Activity (in INR Crores)
        disc_inflow_month NUMERIC(14, 2) DEFAULT 0,
        disc_outflow_month NUMERIC(14, 2) DEFAULT 0,
        disc_net_month NUMERIC(14, 2) DEFAULT 0,
        disc_inflow_fy NUMERIC(14, 2) DEFAULT 0,
        disc_outflow_fy NUMERIC(14, 2) DEFAULT 0,
        disc_net_fy NUMERIC(14, 2) DEFAULT 0,
        disc_sales NUMERIC(14, 2) DEFAULT 0,
        disc_purchases NUMERIC(14, 2) DEFAULT 0,
        disc_turnover_ratio NUMERIC(16, 4), -- Estimated computed proxy: (disc_sales + disc_purchases) / 2 / NULLIF(aum_discretionary, 0)

        -- Complaints
        complaints_pending_start INT DEFAULT 0,
        complaints_received INT DEFAULT 0,
        complaints_resolved INT DEFAULT 0,
        complaints_pending_end INT DEFAULT 0,

        -- Reported Returns
        return_1m NUMERIC(7, 2),
        return_1y NUMERIC(7, 2),

        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_pms_provider_month UNIQUE (registration_no, month_id)
      );
      CREATE INDEX IF NOT EXISTS idx_pms_snapshots_reg_month ON pms_provider_monthly_snapshots(registration_no, month_id DESC);
      CREATE INDEX IF NOT EXISTS idx_pms_snapshots_month_aum ON pms_provider_monthly_snapshots(month_id, grand_total_aum DESC);
      ALTER TABLE pms_provider_monthly_snapshots ADD COLUMN IF NOT EXISTS aum_pf_epfo NUMERIC(14, 2) DEFAULT 0;
      ALTER TABLE pms_provider_monthly_snapshots ADD COLUMN IF NOT EXISTS clients_pf_epfo INT DEFAULT 0;
      ALTER TABLE pms_provider_monthly_snapshots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
      ALTER TABLE pms_provider_monthly_snapshots ALTER COLUMN disc_turnover_ratio TYPE NUMERIC(16, 4);
    `);

    console.log('[3/3] Creating pms_sync_state table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS pms_sync_state (
        key VARCHAR(50) PRIMARY KEY,
        value VARCHAR(255) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    if (client) await client.end();
  }
}

run();
