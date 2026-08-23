import pg from 'pg';
import fs from 'fs';
import path from 'path';

let POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!POSTGRES_URL) {
  const envLocal = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envLocal)) {
    const env = fs.readFileSync(envLocal, 'utf8');
    const match = env.match(/POSTGRES_URL=["']?([^"'\r\n]+)/) || env.match(/DATABASE_URL=["']?([^"'\r\n]+)/);
    if (match) POSTGRES_URL = match[1];
  }
}

async function syncDb() {
  if (!POSTGRES_URL) {
    console.log('No POSTGRES_URL available, skipped DB sync.');
    return;
  }

  const client = new pg.Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('Connected to Postgres');

    const scrPath = path.join(process.cwd(), 'data', 'screener.json');
    const ovPath = path.join(process.cwd(), 'data', 'mf-inception-overrides.json');
    const scr = JSON.parse(fs.readFileSync(scrPath, 'utf8'));
    const ov = JSON.parse(fs.readFileSync(ovPath, 'utf8'));

    // Check if initial_nav column exists in mf_screener, if not add it
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mf_screener' AND column_name='initial_nav') THEN
          ALTER TABLE mf_screener ADD COLUMN initial_nav NUMERIC DEFAULT 10;
        END IF;
      END $$;
    `);

    console.log('Bulk updating mf_screener via UNNEST...');
    const codes = [];
    const rets = [];
    const inits = [];

    for (const f of scr) {
      codes.push(String(f.code));
      rets.push(f.ret_inception);
      inits.push(f.initial_nav || 10);
    }

    await client.query(`
      UPDATE mf_screener AS m
      SET 
        ret_inception = c.ret_inception,
        initial_nav = c.initial_nav
      FROM (
        SELECT 
          UNNEST($1::text[]) AS code,
          UNNEST($2::numeric[]) AS ret_inception,
          UNNEST($3::numeric[]) AS initial_nav
      ) AS c
      WHERE m.code = c.code;
    `, [codes, rets, inits]);

    console.log('Bulk updating mf_inception via UNNEST...');
    const ovCodes = [];
    const ovDates = [];
    const ovNavs = [];

    for (const [code, info] of Object.entries(ov)) {
      if (!/^\d+$/.test(code) || !info || typeof info !== 'object') continue;
      const navVal = parseFloat(info.inception_nav);
      if (isNaN(navVal) || navVal <= 0) continue;
      ovCodes.push(code);
      ovDates.push(String(info.inception_date));
      ovNavs.push(navVal);
    }

    await client.query(`
      UPDATE mf_inception AS m
      SET 
        inception_date = c.inception_date,
        inception_nav = c.inception_nav
      FROM (
        SELECT 
          UNNEST($1::text[]) AS code,
          UNNEST($2::text[]) AS inception_date,
          UNNEST($3::numeric[]) AS inception_nav
      ) AS c
      WHERE m.code = c.code;
    `, [ovCodes, ovDates, ovNavs]);

    console.log('Postgres successfully updated in bulk!');
  } catch (e) {
    console.error('Database sync error:', e.message);
  } finally {
    await client.end();
  }
}

syncDb();
