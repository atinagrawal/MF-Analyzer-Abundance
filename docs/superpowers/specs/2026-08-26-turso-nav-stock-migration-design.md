# Turso Migration for NAV & Stock EOD History — Design Spec

> **For agentic workers:** this is a design spec, not an implementation plan. Once approved, the next step is the `superpowers:writing-plans` skill to turn this into a task-by-task plan (recommended execution: `superpowers:subagent-driven-development`).

## Context

The app's Postgres database (Prisma Postgres, host `db.prisma.io`) is at 781MB against a 500MB free-tier storage cap. `mf_nav_history` (523MB, ~3.94M rows) and `stock_eod` (199MB, ~570K live rows after retention pruning) together account for 92% of that size. Both tables are pure historical time-series — append-only, keyed by (entity, date), written exclusively by scheduled scripts, never by a live user request.

Everything else in the database (`mf_screener`, `stock_signals`, `sector_breadth`, `sector_isin_map`, auth tables, `manual_holdings`, etc.) is relational/transactional, actively joined against in application code, and stays on Postgres. This spec covers moving only `mf_nav_history` and `stock_eod` to Turso (SQLite/libSQL).

## Goals

- Free the ~722MB these two tables occupy on Prisma Postgres, bringing the remaining DB comfortably under the 500MB free tier.
- No functional regression: every script and route that reads/writes these tables today must keep working, with the same data shape and semantics.
- No new dual-write complexity: since nothing but scheduled scripts writes to these tables, cutover can be a clean one-time migration, not an ongoing sync.

## Non-goals

- Migrating any other table. `mf_screener`, `stock_signals`, `sector_breadth`, `sector_isin_map`, and all auth/user tables stay on Postgres.
- Introducing Turso embedded replicas. Given every consumer is either a serverless Vercel Function or an ephemeral GitHub Actions runner — neither keeps a warm local disk between invocations — a local replica would resync from scratch constantly, buying nothing over plain remote queries.
- Changing the retention policy on `stock_eod` (still pruned to 450 days by `ingest-eod.mjs`) or adding new signals/columns.

## Architecture

### Two Turso databases, one per domain

- **`mf-nav-history`** — replaces the Postgres `mf_nav_history` table.
- **`stock-eod`** — replaces the Postgres `stock_eod` table.

Kept separate because nothing in the codebase queries both in the same operation — `mf_nav_history` serves mutual-fund NAV lookups, `stock_eod` serves the individual-stock breadth/signals pipeline. Combining them into one database would only make each script's connection setup less obvious about what it depends on.

Both databases are provisioned in Turso's `iad` region (Washington, D.C.), matching this project's Vercel Functions region (`iad1`, confirmed via the Vercel API against project `mfcalc-abundance` / deployment `dpl_JBP59MESQ1foJSRQEZhXSHdF9FCy`) — same metro as today, no latency regression from region placement.

### Client library

`@tursodatabase/serverless` — the fetch-based, zero-native-dependency driver Turso now recommends for serverless targets (the older `@libsql/client` uses native bindings and was moved to "legacy" status in Turso's docs in April 2026). One client package works unmodified in both GitHub Actions runners (Node 24, `ubuntu-latest`) and Vercel Functions (`nodejs` runtime), so scripts and the one live route share identical connection code.

### Two thin store modules

`lib/navHistoryStore.js` and `lib/stockEodStore.js` are the only files that import the Turso client or write raw SQL against these two databases. Every script/route listed below calls into these modules instead of querying Turso directly. This is where the SQLite-specific translation work happens exactly once:

- Postgres `code = ANY($1)` (array bind param) → SQLite has no array bind type; translates to a generated `code IN (?,?,?,...)` placeholder list.
- Postgres `DATE` columns → stored as SQLite `TEXT` in strict `YYYY-MM-DD` format (matches the existing `pg.types.setTypeParser(1082, ...)` string-date convention several scripts already rely on, so no date-shifting bugs carry over).
- Postgres `NUMERIC(14,4)` → SQLite `REAL` (SQLite has no fixed-point type; values are rounded to the same precision on write, matching what the app already does with `toFixed()` before insert in most call sites).
- Chunked upserts (`INSERT ... ON CONFLICT DO UPDATE`) — SQLite supports the same `ON CONFLICT` upsert syntax, so this pattern carries over almost unchanged, just re-pointed at the new client.
- Pagination for any read that could return a very large result set, to stay clear of Turso's `RESPONSE_TOO_LARGE` ceiling (observed in the wild around 180MB / 2.4M rows — well above anything today's queries return, but the one-time backfill described below reads the entire 3.94M-row table and must page through it rather than `SELECT *` in one shot).

#### `lib/navHistoryStore.js` — SQLite schema

```sql
CREATE TABLE IF NOT EXISTS mf_nav_history (
  code     TEXT NOT NULL,
  nav_date TEXT NOT NULL,   -- YYYY-MM-DD
  nav      REAL NOT NULL,
  PRIMARY KEY (code, nav_date)
);
CREATE INDEX IF NOT EXISTS idx_nav_history_code ON mf_nav_history (code, nav_date);
```

Exported functions (names and shapes drawn directly from how every current call site uses the table):

- `getLatestNav(code)` → `{ nav, navDate } | null` — replaces `SELECT nav, nav_date FROM mf_nav_history WHERE code = $1 ORDER BY nav_date DESC LIMIT 1` (`lib/holdingsLookup.js`).
- `getNavAsOf(code, dateIso)` → `{ nav, navDate } | null` — replaces the `nav_date <= $2 ORDER BY nav_date DESC LIMIT 1` lookup (`lib/holdingsLookup.js`, `scripts/recalc-merged-screener.mjs`).
- `getOldestNav(code)` → `{ nav, navDate } | null` — replaces the `ORDER BY nav_date ASC LIMIT 1` lookup (`lib/holdingsLookup.js`).
- `getSeriesForCode(code)` → `[{ navDate, nav }]` ascending — replaces the single-code full-series reads in `scripts/recalc-merged-screener.mjs` and `scripts/sync-lineage-to-nav-history.mjs`.
- `getSeriesForCodes(codes)` → `[{ code, navDate, nav }]` ordered by `code, navDate` — replaces `WHERE code = ANY($1)` in `scripts/build-screener.mjs`'s lineage-history preload (86 codes today; paginated internally if the result set ever grows large enough to risk `RESPONSE_TOO_LARGE`).
- `getGlobalStats()` → `{ totalRows, totalFunds, latestDate }` — replaces the `COUNT(*)`, `COUNT(DISTINCT code)`, `MAX(nav_date)` reads in `scripts/append-nav-history.mjs` and `scripts/verify-nav-history.mjs`.
- `getDistinctCodes()` → `string[]` — used by `scripts/verify-nav-history.mjs` and `scripts/audit-nav-coverage.mjs` to diff against `mf_screener`'s code list (that diff itself stays in the caller, since it needs a Postgres query too).
- `upsertRows(rows)` where `rows = [{ code, navDate, nav }]` — chunked `INSERT ... ON CONFLICT (code, nav_date) DO UPDATE SET nav = excluded.nav`, same 200-row-chunk convention as today. Used by `scripts/append-nav-history.mjs`, `scripts/bootstrap-nav-history.mjs`, `scripts/sync-lineage-to-nav-history.mjs`.
- `getDb()` — raw client escape hatch, for the two manual diagnostic scripts (`scripts/verify-nav-history.mjs`, `scripts/audit-nav-coverage.mjs`) whose stale/sparse/date-range health-check queries are one-off reporting logic that doesn't earn a bespoke named function. These two scripts are not part of the scheduled pipeline (confirmed: neither appears in any `.github/workflows/*.yml`), so this is a deliberate lower-rigor path for tooling, not the production read/write surface.

#### `lib/stockEodStore.js` — SQLite schema

```sql
CREATE TABLE IF NOT EXISTS stock_eod (
  trade_date TEXT NOT NULL,   -- YYYY-MM-DD
  isin       TEXT NOT NULL,
  symbol     TEXT,
  name       TEXT,
  series     TEXT,
  open       REAL,
  high       REAL,
  low        REAL,
  close      REAL NOT NULL,
  prev_close REAL,
  volume     INTEGER,
  turnover   REAL,
  PRIMARY KEY (trade_date, isin)
);
CREATE INDEX IF NOT EXISTS idx_stock_eod_isin_date ON stock_eod (isin, trade_date);
CREATE INDEX IF NOT EXISTS idx_stock_eod_date ON stock_eod (trade_date);
```

Exported functions:

- `upsertDay(dateIso, rows)` — chunked upsert (500-row chunks, matching today), used by `scripts/ingest-eod.mjs`.
- `pruneOlderThan(days)` — `DELETE FROM stock_eod WHERE trade_date < date('now', '-' || ? || ' days')`, replacing the 450-day retention delete in `scripts/ingest-eod.mjs`.
- `getWindow(endDateIso, days = 400)` → `[{ isin, tradeDate, close, high, low, prevClose, turnover }]` ordered by `isin, tradeDate` — this exact "N-day window ending on a date, all ISINs" shape is used verbatim by `scripts/build-breadth.mjs`, `scripts/build-signals.mjs`, and `scripts/build-sector-breadth.mjs`; one function serves all three.
- `getAll()` → same shape as `getWindow` but unbounded, ordered by `isin, tradeDate` — used by `scripts/build-breadth.mjs`'s `--all` backfill mode. Paginated internally.
- `getDistinctTradeDates()` → `string[]` — used by `scripts/build-breadth.mjs`'s self-heal date-gap detection.
- `getLatestTradeDate()` → `string | null` — replaces the `WITH latest AS (SELECT MAX(trade_date) ...)` CTE in `app/api/sector-detail/route.js`.
- `getLatestForIsins(isins)` → `[{ isin, symbol, companyName, tradeDate, close, prevClose, open, high, low, volume, turnover }]` for the given ISIN list, at `getLatestTradeDate()` — the `stock_eod` half of `app/api/sector-detail/route.js`'s three-table join (see below).

### The one join that has to split

`app/api/sector-detail/route.js`'s `fetchStocksFromDB(sectorName)` currently does a single Postgres query joining `stock_eod` (moving) with `sector_isin_map` and `stock_signals` (staying). Cross-database SQL joins don't exist, so this becomes:

1. Query Postgres for `sector_isin_map` rows where `sector = $1` → list of ISINs.
2. Call `stockEodStore.getLatestForIsins(isins)` (Turso).
3. Query Postgres for `stock_signals` rows matching those ISINs at the latest trade date.
4. Merge the three result sets by ISIN in application code, producing the same shape the route returns today.

This route already sits behind a 5-minute R2 blob cache (`TTL_MS` in the same file), so the extra round trip only happens once per sector per 5 minutes — not a per-request cost.

Two other files do the same kind of cross-database join and need the identical split-and-merge treatment, but as noted above they're manual diagnostic tools, not scheduled: `scripts/audit-nav-coverage.mjs` (line 43, `mf_nav_history JOIN mf_screener`) and `scripts/verify-nav-history.mjs` (lines 92, 99, `mf_screener LEFT JOIN` against distinct `mf_nav_history` codes).

## Migration & cutover

Because only scheduled scripts write to these two tables (verified: no `app/` route writes to either), there is no dual-write period to design — the sequence is a straight backfill-then-switch:

1. **Provision** the two Turso databases (`mf-nav-history`, `stock-eod`) in the `iad` region, create the schemas above, add `TURSO_NAV_HISTORY_URL` / `TURSO_NAV_HISTORY_TOKEN` and `TURSO_STOCK_EOD_URL` / `TURSO_STOCK_EOD_TOKEN` as GitHub Actions repo secrets and Vercel project env vars.
2. **Backfill**: a one-time script reads all 3.94M `mf_nav_history` rows and ~570K `stock_eod` rows from Postgres in paginated batches (ordered by primary key, `LIMIT`/`OFFSET` or keyset pagination) and writes them into the corresponding Turso database via `upsertRows`/`upsertDay`. Run from a local machine or a one-off GitHub Actions job, not time-constrained.
3. **Verify**: compare row counts and a checksum (e.g., `SUM(nav)` per table, or a sampled per-code date-range comparison) between Postgres and Turso. Any mismatch blocks cutover.
4. **Cut over reads and writes**: update the ~10 call sites (listed above) to import `lib/navHistoryStore.js` / `lib/stockEodStore.js` instead of querying Postgres directly for these two tables. Deploy.
5. **Observe one full cycle**: let the next scheduled runs of `screener.yml` (daily, `append-nav-history.mjs`) and `breadth.yml` (weekdays, `ingest-eod.mjs` → `build-breadth.mjs` → `build-signals.mjs` → `build-sector-breadth.mjs`) complete against Turso and confirm output matches expectations (row counts advance by one day, no errors).
6. **Reclaim space**: only after step 5 has been clean for a few days, drop `mf_nav_history` and `stock_eod` from Postgres. Not done same-day as cutover — keeps a rollback path if something in the new pipeline misbehaves.

## Code touch-point inventory

**Scheduled pipeline (production-critical, must be correct at cutover):**
- `scripts/append-nav-history.mjs` (daily, `screener.yml`)
- `scripts/build-screener.mjs` — lineage-history preload only (daily, `screener.yml`)
- `scripts/ingest-eod.mjs` (weekdays, `breadth.yml`)
- `scripts/build-breadth.mjs` (weekdays, `breadth.yml`)
- `scripts/build-signals.mjs` (weekdays, `breadth.yml`)
- `scripts/build-sector-breadth.mjs` (weekdays, `breadth.yml`)
- `app/api/sector-detail/route.js` (live route, needs the join split above)

**Manual/diagnostic tools (converted for consistency, not gating cutover):**
- `scripts/bootstrap-nav-history.mjs` (`workflow_dispatch` only)
- `scripts/verify-nav-history.mjs` (invoked by the bootstrap workflow, and manually)
- `scripts/sync-lineage-to-nav-history.mjs` (not wired to any workflow)
- `scripts/recalc-merged-screener.mjs` (not wired to any workflow)
- `scripts/audit-nav-coverage.mjs` (not wired to any workflow)
- `lib/holdingsLookup.js`'s `computeReturnsFromNavHistory()` (live fallback path, step 5 of 6 — low traffic, but user-facing when it fires)

## Error handling

- `upsertRows`/`upsertDay` in both store modules let failures throw — no silent catch-and-continue. This matches this repo's established stance after past incidents where a swallowed error masked bad nightly data; a failed Turso write should fail the GitHub Actions step loudly, the same as a failed Postgres write does today.
- `app/api/sector-detail/route.js`'s existing `try/catch` around its DB path (falling through to the NSE-live and stale-blob fallbacks) is unchanged — a Turso failure there is handled exactly like a Postgres failure is today, by the same fallback chain.
- `lib/holdingsLookup.js`'s existing `try { ... } catch { console.warn(...) }` around `computeReturnsFromNavHistory` is unchanged for the same reason — it's already a best-effort fallback among six.

## Testing / validation

- No existing automated test suite covers these scripts (plain Node + `assert` convention used elsewhere in this repo has no prior art here) — the plan's verification is the row-count/checksum comparison in the migration steps above, plus running each scheduled script manually against Turso once before relying on the cron schedule, matching how this repo has verified previous data-pipeline changes.
- `npm run build` after the code changes, to confirm nothing broke at build time (the Next.js production build already surfaces missing-import errors, which is the main build-time risk from switching store modules).
- Manual spot-check of `/api/sector-detail?index=NIFTY%20AUTO` (or another core sector) after deploy, comparing output to a pre-migration snapshot.

## Open questions / risks

- Turso credentials (`TURSO_..._TOKEN`) need to be added as both GitHub Actions secrets and Vercel env vars — a manual setup step outside this repo, to be done before the backfill step.
- SQLite's single-writer-per-database model is a non-issue here (only one scheduled script writes to each table, never concurrently with itself), but is worth stating explicitly since it's a real constraint of the platform.
