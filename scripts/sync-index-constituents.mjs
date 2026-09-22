#!/usr/bin/env node
/**
 * scripts/sync-index-constituents.mjs
 *
 * Bi-weekly synchronization script for 64 benchmark index constituents.
 * - Ingests 56 NSE CSVs from niftyindices.com (with custom User-Agent).
 * - Ingests 8 BSE JSON feeds from bseindices.com AsiaIndexAPI.
 * - Upserts constituents into PostgreSQL `index_constituents` table.
 * - Writes JSON caches to Cloudflare R2 (`index-constituents/<slug>.json`)
 *   and local disk (`data/index-constituents/<slug>.json`).
 *
 * Usage:
 *   node scripts/sync-index-constituents.mjs [--dry-run] [--slug=<slug>]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { INDEX_CONSTITUENTS_CONFIG } from '../lib/indexConstituentsConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data/index-constituents');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const slugFilter = args.find(a => a.startsWith('--slug='))?.split('=')[1] || null;

// Parse a single CSV line respecting quotes
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

// Normalize company names for fuzzy resolution
function normalizeCompanyName(name) {
  return (name || '')
    .toUpperCase()
    .replace(/\b(LTD|LIMITED|PVT|CORP|CORPORATION|INC|HOLDINGS|CO)\b/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return res;
      if (attempt === retries) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function main() {
  console.log(`[sync-index-constituents] Starting sync for Phase 1 indices (${INDEX_CONSTITUENTS_CONFIG.length} configured)...`);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Optional PostgreSQL connection
  let pool = null;
  if (process.env.POSTGRES_URL && !isDryRun) {
    try {
      const { default: dbPool } = await import('../lib/db.js');
      pool = dbPool;
      console.log('[sync-index-constituents] Connected to PostgreSQL. Ensuring index_constituents schema...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS index_constituents (
          id           SERIAL PRIMARY KEY,
          index_slug   TEXT NOT NULL,
          as_of_date   DATE NOT NULL,
          symbol       TEXT NOT NULL,
          company_name TEXT NOT NULL,
          industry     TEXT,
          series       TEXT,
          isin         TEXT,
          weight       NUMERIC,
          source       TEXT NOT NULL,
          created_at   TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (index_slug, as_of_date, symbol)
        );
        CREATE INDEX IF NOT EXISTS idx_constituents_slug_date ON index_constituents(index_slug, as_of_date DESC);
        CREATE INDEX IF NOT EXISTS idx_constituents_symbol ON index_constituents(symbol);
        CREATE INDEX IF NOT EXISTS idx_constituents_isin ON index_constituents(isin);
      `);
      console.log('[sync-index-constituents] index_constituents table & indexes ensured.');
    } catch (err) {
      console.warn('[sync-index-constituents] PostgreSQL connection failed, continuing with file/R2 cache:', err.message);
    }
  } else {
    console.log('[sync-index-constituents] No POSTGRES_URL or running in dry-run mode. Skipping DB writes.');
  }

  // Optional Cloudflare R2
  let r2Put = null;
  if (!isDryRun && process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME) {
    try {
      const r2 = await import('../lib/r2.js');
      r2Put = r2.r2Put;
      console.log('[sync-index-constituents] Cloudflare R2 configured.');
    } catch (err) {
      console.warn('[sync-index-constituents] R2 import failed, skipping R2:', err.message);
    }
  }

  // 1. Preload nseCrossReference from existing files in DATA_DIR
  const nseCrossReference = new Map(); // normalizedName -> { symbol, isin, companyName }
  if (fs.existsSync(DATA_DIR)) {
    const existingFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    for (const file of existingFiles) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
        if (content.exchange === 'NSE' && Array.isArray(content.constituents)) {
          for (const item of content.constituents) {
            const norm = normalizeCompanyName(item.companyName);
            if (norm && !nseCrossReference.has(norm)) {
              nseCrossReference.set(norm, {
                symbol: item.symbol,
                isin: item.isin,
                companyName: item.companyName,
              });
            }
          }
        }
      } catch (_) {}
    }
  }

  function resolveBseToNse(scripName) {
    const norm = normalizeCompanyName(scripName);
    if (!norm) return null;
    if (nseCrossReference.has(norm)) return nseCrossReference.get(norm);
    if (norm.length >= 7) {
      for (const [k, v] of nseCrossReference.entries()) {
        if (k.startsWith(norm) || norm.startsWith(k)) {
          return v;
        }
      }
    }
    return null;
  }

  const targetIndices = slugFilter
    ? INDEX_CONSTITUENTS_CONFIG.filter(idx => idx.slug === slugFilter)
    : INDEX_CONSTITUENTS_CONFIG;

  const results = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  for (const idx of targetIndices) {
    console.log(`[sync-index-constituents] Processing [${idx.exchange}] ${idx.name} (${idx.slug})...`);
    let constituents = [];
    let asOfDate = todayStr;

    try {
      if (idx.fetchConfig.type === 'NSE_CSV') {
        const res = await fetchWithRetry(idx.fetchConfig.csvUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/csv,text/plain,*/*',
          },
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          throw new Error(`NSE returned HTML instead of CSV (likely blocked or 404 page)`);
        }

        const text = await res.text();
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          throw new Error(`Invalid CSV content: only ${lines.length} lines`);
        }

        // Header: Company Name,Industry,Symbol,Series,ISIN Code
        const header = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
        const colCompany = header.findIndex(h => h.includes('company'));
        const colIndustry = header.findIndex(h => h.includes('industry'));
        const colSymbol = header.findIndex(h => h.includes('symbol'));
        const colSeries = header.findIndex(h => h.includes('series'));
        const colIsin = header.findIndex(h => h.includes('isin'));

        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i]);
          if (cols.length < 3) continue;

          const companyName = cols[colCompany] || cols[0];
          const industry = colIndustry >= 0 ? cols[colIndustry] : '';
          const symbol = colSymbol >= 0 ? cols[colSymbol] : '';
          const series = colSeries >= 0 ? cols[colSeries] : 'EQ';
          const isin = colIsin >= 0 ? cols[colIsin] : '';

          if (!symbol && !companyName) continue;

          const item = {
            symbol: symbol.toUpperCase(),
            companyName: companyName.replace(/^"|"$/g, ''),
            industry: industry.replace(/^"|"$/g, ''),
            series: series.toUpperCase(),
            isin: isin.toUpperCase(),
            weight: null,
            source: 'NSE_CSV',
          };
          constituents.push(item);

          // Add to cross-reference
          const norm = normalizeCompanyName(item.companyName);
          if (norm && !nseCrossReference.has(norm)) {
            nseCrossReference.set(norm, {
              symbol: item.symbol,
              isin: item.isin,
              companyName: item.companyName,
            });
          }
        }
      } else if (idx.fetchConfig.type === 'BSE_JSON') {
        const url = `https://www.bseindices.com/AsiaIndexAPI/api/Codewise_Indices/w?code=${idx.fetchConfig.bseCode}`;
        const res = await fetchWithRetry(url, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json,*/*',
          },
        });

        const data = await res.json();
        const table = Array.isArray(data?.Table) ? data.Table : [];
        if (!table.length) {
          throw new Error(`Empty BSE table for code ${idx.fetchConfig.bseCode}`);
        }

        if (table[0]?.TransDate) {
          asOfDate = table[0].TransDate.split('T')[0];
        }

        for (const row of table) {
          const scripName = (row.SCRIPNAME || '').trim();
          const industry = (row.Industry_name || '').trim();
          const scripCode = String(row.SCRIP_CODE || '').trim();

          // Try resolving to NSE symbol and ISIN
          const matched = resolveBseToNse(scripName);

          constituents.push({
            symbol: matched?.symbol || scripCode || scripName,
            companyName: matched?.companyName || scripName,
            industry: industry,
            series: 'EQ',
            isin: matched?.isin || null,
            weight: null,
            scripCode: scripCode,
            source: 'BSE_JSON',
          });
        }
      }

      console.log(`[sync-index-constituents] Successfully ingested ${constituents.length} constituents for ${idx.name}`);

      const payload = {
        slug: idx.slug,
        name: idx.name,
        exchange: idx.exchange,
        category: idx.category,
        description: idx.description,
        asOf: asOfDate,
        count: constituents.length,
        constituents,
      };

      // 1. Write to local disk cache
      const localFilePath = path.join(DATA_DIR, `${idx.slug}.json`);
      fs.writeFileSync(localFilePath, JSON.stringify(payload, null, 2), 'utf8');

      // 2. Write to R2 if available
      if (r2Put) {
        const r2Key = `index-constituents/${idx.slug}.json`;
        await r2Put(r2Key, JSON.stringify(payload)).catch(e => {
          console.warn(`[sync-index-constituents] R2 upload failed for ${idx.slug}:`, e.message);
        });
      }

      // 3. Write to PostgreSQL if available
      if (pool) {
        // Ensure symbols are unique within this index snapshot to prevent PostgreSQL
        // "ON CONFLICT DO UPDATE command cannot affect row a second time" batch conflict
        const seenSymbols = new Set();
        const dbConstituents = [];
        for (const c of constituents) {
          const sym = (c.symbol || '').toUpperCase().trim();
          if (!sym) continue;
          if (seenSymbols.has(sym)) {
            const disambiguated = c.scripCode ? `${sym}-${c.scripCode}` : `${sym}-2`;
            if (seenSymbols.has(disambiguated)) continue;
            seenSymbols.add(disambiguated);
            dbConstituents.push({ ...c, symbol: disambiguated });
          } else {
            seenSymbols.add(sym);
            dbConstituents.push(c);
          }
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          // Purge previous snapshot for this index to maintain exactly one current snapshot in DB
          await client.query('DELETE FROM index_constituents WHERE index_slug = $1', [idx.slug]);
          const chunkSize = 100;
          for (let i = 0; i < dbConstituents.length; i += chunkSize) {
            const chunk = dbConstituents.slice(i, i + chunkSize);
            const valueRows = [];
            const values = [];
            chunk.forEach((c, itemIdx) => {
              const offset = itemIdx * 9;
              valueRows.push(
                `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
              );
              values.push(
                idx.slug,
                asOfDate,
                c.symbol,
                c.companyName,
                c.industry || null,
                c.series || null,
                c.isin || null,
                c.weight || null,
                c.source
              );
            });
            await client.query(
              `
              INSERT INTO index_constituents (
                index_slug, as_of_date, symbol, company_name, industry, series, isin, weight, source
              ) VALUES ${valueRows.join(', ')}
              ON CONFLICT (index_slug, as_of_date, symbol)
              DO UPDATE SET
                company_name = EXCLUDED.company_name,
                industry = EXCLUDED.industry,
                series = EXCLUDED.series,
                isin = EXCLUDED.isin,
                weight = EXCLUDED.weight,
                source = EXCLUDED.source,
                created_at = NOW();
              `,
              values
            );
          }
          await client.query('COMMIT');
        } catch (dbErr) {
          await client.query('ROLLBACK');
          console.error(`[sync-index-constituents] DB transaction failed for ${idx.slug}:`, dbErr.message);
        } finally {
          client.release();
        }
      }

      results.push({ slug: idx.slug, name: idx.name, count: constituents.length, status: 'OK' });
    } catch (err) {
      console.error(`[sync-index-constituents] ERROR processing ${idx.name}:`, err.message);
      results.push({ slug: idx.slug, name: idx.name, count: 0, status: 'ERROR', error: err.message });
    }

    // Gentle rate limit between fetches
    await new Promise(r => setTimeout(r, 200));
  }

  if (pool) {
    await pool.end();
  }

  const successCount = results.filter(r => r.status === 'OK').length;
  console.log(`\n[sync-index-constituents] COMPLETED: ${successCount}/${targetIndices.length} indices synced successfully.`);
  if (successCount < targetIndices.length) {
    const failed = results.filter(r => r.status !== 'OK');
    console.warn('[sync-index-constituents] Failed indices:', failed);
  }
}

main().catch(err => {
  console.error('[sync-index-constituents] FATAL:', err);
  process.exit(1);
});
