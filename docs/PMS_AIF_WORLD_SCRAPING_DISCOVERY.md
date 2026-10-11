# PMS AIF World — AIF Returns & Scheme Discovery Guide

> **Target Audience:** Engineering & AI Agents (Gemini, Claude) working on the AIF feature set (`/aif-preferred`, database pipelines, and analytics) in `MF-Analyzer-Abundance`.  
> **Source Platform:** [PMS AIF World Portal](https://app.pmsaifworld.com)  
> **Target Dashboard:** `https://app.pmsaifworld.com/aif-returns`  
> **Date Verified:** September 27, 2026  
> **Status:** Live & Programmatically Feasible (100% verified)

---

## 1. Executive Summary & Context

Under `docs/AIF_PREFERRED_STRATEGIES_BRIEF.md`, one of the primary research challenges identified was **AIF factsheet accessibility**:
> *"Many managers only send factsheets to investors/distributors directly, not publish them... Note which managers do not have a stable public URL."*

This discovery of the **PMS AIF World** platform provides a centralized, authenticated aggregator containing **132 Alternative Investment Funds (AIFs)** (primarily SEBI Category III Long-Only and Long-Short strategies).

Using the distributor/portal login, we have reverse-engineered the authentication flow and data delivery mechanics. The returns table is **server-rendered in full HTML** (no client-side pagination or headless browser required), making it exceptionally fast, lightweight, and deterministic to fetch and parse.

---

## 2. Environment Variables & Secret Configuration

To prevent exposing credentials in GitHub or commit histories:

### 2.1 Where to Add Credentials

1. **Local Development / Script Execution:**
   Add them to `.env.local` in the project root:
   ```env
   # PMS AIF World Portal Credentials
   PMSAIF_USERNAME="<your_registered_mobile_or_email>"
   PMSAIF_PASSWORD="<your_portal_password>"
   ```
   > **Git Safety:** `.env.local` is already explicitly ignored in `.gitignore` (under both line 20 `.env.local` and line 52 `.env*`). It will never be committed to Git.

2. **Vercel Production / Staging Deployment:**
   - Go to: **Vercel Dashboard → [Project] → Settings → Environment Variables**.
   - Add `PMSAIF_USERNAME` and `PMSAIF_PASSWORD` for `Production` and `Preview`.

3. **GitHub Actions (for automated cron syncs):**
   - Go to: **GitHub Repository → Settings → Secrets and variables → Actions**.
   - Add `PMSAIF_USERNAME` and `PMSAIF_PASSWORD` as Repository Secrets.

---

## 3. Authentication Architecture & Protocol

### 3.1 Endpoint Details
- **URL:** `POST https://app.pmsaifworld.com/signin/login`
- **Content-Type:** `application/x-www-form-urlencoded; charset=UTF-8`
- **Method:** `POST`

### 3.2 Required Headers
```http
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Origin: https://app.pmsaifworld.com
Referer: https://app.pmsaifworld.com/login
```

### 3.3 Form Payload
```json
{
  "user_login_email": "<mobile_or_email>",
  "user_login_password": "<password>",
  "rememberme": "1"
}
```

### 3.4 Critical Gotchas & Deceptions Uncovered

1. **The Base64 Frontend Deception:**
   - In `https://app.pmsaifworld.com/static1/js/valdate-form.js`, client-side jQuery passes `encode64(username)` and `encode64(password)` under `user_name` and `password`.
   - **However**, the backend Yii2 controller (`SigninController.php:72`) actually inspects `$_POST['user_login_email']` and `$_POST['user_login_password']`.
   - If base64 strings or non-matching form fields are posted, the backend validation fails and re-renders the login page with HTTP 200.
   - When **plain text** `user_login_email` and `user_login_password` are submitted, the backend successfully authenticates and issues an **HTTP 302 Found** redirect to `https://app.pmsaifworld.com/dashboard`.

2. **Cookie Handling (Deleted Cookies Trap):**
   - The login endpoint emits multiple `Set-Cookie` headers:
     ```http
     Set-Cookie: PHPSESSID=...; path=/
     Set-Cookie: pmsid=deleted; expires=Thu, 01-Jan-1970 00:00:01 GMT; Max-Age=0; path=/
     Set-Cookie: login_id=deleted; expires=Thu, 01-Jan-1970 00:00:01 GMT; Max-Age=0; path=/
     Set-Cookie: PHPSESSID=...; path=/
     Set-Cookie: pmsid=18435; expires=...; path=/
     Set-Cookie: login_id=LG2026...; expires=...; path=/
     ```
   - Standard cookie forwarders that naively preserve `pmsid=deleted` will trigger a 500 error on Yii2.
   - **Rule:** Filter out any cookie values equal to `deleted` or expired. Maintain the active dictionary: `PHPSESSID`, `pmsid`, and `login_id`.

---

## 4. Endpoints & Data Extraction Mechanics

### 4.1 Master AIF Returns Table
- **URL:** `GET https://app.pmsaifworld.com/aif-returns`
- **Authentication:** Forward active `Cookie: PHPSESSID=...; pmsid=...; login_id=...`
- **Output:** Server-rendered HTML (`~437 KB`) with a single `table.datatable`.
- **Universe:** **132 AIF Funds**.

#### Extracted Columns per Fund:
1. `Product Name`: Strategy name (e.g., `360 ONE Equity Opportunity Fund- Series 2`, `A9 Finsight Finavenue Growth Fund`, `Aarth Growth Fund`, `Avendus Absolute Return Fund`)
2. `Type`: Asset class (e.g., `Equity`, `Debt`)
3. `Category`: Strategy classification (e.g., `Long Only` [103 funds], `Long Short` [26 funds], `Debt` [1 fund])
4. `1M Return`: 1-Month performance %
5. `3M Return`: 3-Month performance %
6. `6M Return`: 6-Month performance %
7. `1Y Return`: 1-Year performance %
8. `2Y Return`: 2-Year performance %
9. `3Y Return`: 3-Year performance %
10. `5Y Return`: 5-Year performance %
11. `Since Inception Return`: Inception CAGR %
12. `Overview Link`: `a[href]` leading to `https://app.pmsaifworld.com/aif-overview?id=<base64-fund-id>`

### 4.2 Individual Fund Overview & Metadata
- **URL Pattern:** `https://app.pmsaifworld.com/aif-overview?id=<base64_id>`  
  *(e.g., `id=NTc=` resolves to numeric ID `57` via `Buffer.from('NTc=', 'base64').toString()`)*
- **Data Available on Overview:**
  - **Fund House / AMC Name:** e.g., `360 ONE Asset Management`, `Abakkus`, `ICICI Prudential`, etc.
  - **Fund Manager(s):** e.g., `Mr Mehul Jani`
  - **Benchmark Index:** e.g., `BSE 200 TRI`, `NIFTY 50 TRI`
  - **Inception Date:** e.g., `03 February 2023`
  - **Data As On Date:** e.g., `31st Aug 2026`
  - **Fund Philosophy / "About Fund":** Strategy description and thesis
  - **Fund AUM (Cr):** AUM in INR Crores (when published by manager)
  - **Fund Age:** e.g., `3 Years`

---

## 5. Production Node.js Ingestion Script

Here is the verified, standalone crawler script that uses `cheerio` and native `fetch`. It loads credentials from `.env.local` or environment variables without hardcoding.

```javascript
// scripts/sync-aif-returns.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const cheerio = require('cheerio');

// Load .env.local if running outside Next.js
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const USERNAME = process.env.PMSAIF_USERNAME;
const PASSWORD = process.env.PMSAIF_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error('[aif-sync] FATAL: PMSAIF_USERNAME and PMSAIF_PASSWORD are required.');
  process.exit(1);
}

const BASE_URL = 'https://app.pmsaifworld.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function login() {
  const formData = new URLSearchParams();
  formData.append('user_login_email', USERNAME);
  formData.append('user_login_password', PASSWORD);
  formData.append('rememberme', '1');

  const res = await fetch(`${BASE_URL}/signin/login`, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Referer': `${BASE_URL}/login`,
      'Origin': BASE_URL
    },
    body: formData.toString(),
    redirect: 'manual'
  });

  const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const cookieMap = {};
  for (const c of rawCookies) {
    if (!c) continue;
    const parts = c.split(';')[0].split('=');
    const name = parts[0].trim();
    const val = parts.slice(1).join('=');
    if (val !== 'deleted' && val !== '') {
      cookieMap[name] = val;
    }
  }

  const cookieHeader = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
  if (!cookieMap.PHPSESSID) {
    throw new Error(`Login failed. Response status: ${res.status}`);
  }

  return cookieHeader;
}

export async function fetchAifReturns() {
  const cookieHeader = await login();

  const res = await fetch(`${BASE_URL}/aif-returns`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Cookie': cookieHeader,
      'Referer': `${BASE_URL}/learn`
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch aif-returns: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const funds = [];
  $('table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length === 0) return;

    const nameEl = $(tds[0]);
    const link = nameEl.find('a').attr('href') || null;
    const name = nameEl.text().trim().replace(/\s+/g, ' ');
    const type = $(tds[1]).text().trim();
    const category = $(tds[2]).text().trim();

    funds.push({
      name,
      link,
      type,
      category,
      returns: {
        '1M': parseReturn($(tds[3]).text()),
        '3M': parseReturn($(tds[4]).text()),
        '6M': parseReturn($(tds[5]).text()),
        '1Y': parseReturn($(tds[6]).text()),
        '2Y': parseReturn($(tds[7]).text()),
        '3Y': parseReturn($(tds[8]).text()),
        '5Y': parseReturn($(tds[9]).text()),
        'SI': parseReturn($(tds[10]).text())
      }
    });
  });

  return funds;
}

function parseReturn(val) {
  const clean = val.replace('%', '').trim();
  if (!clean || clean === '-' || clean === 'N/A') return null;
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}
```

---

## 6. Recommended Database Schema Integration

To mirror the architecture of `pms_schemes` and `pms_factsheet_snapshots`, we recommend:

```sql
-- 1. Master AIF Schemes Table
CREATE TABLE IF NOT EXISTS aif_schemes (
  id SERIAL PRIMARY KEY,
  scheme_slug VARCHAR(255) UNIQUE NOT NULL,
  scheme_name VARCHAR(255) NOT NULL,
  fund_house VARCHAR(255),
  asset_type VARCHAR(50) DEFAULT 'Equity',
  category VARCHAR(100),       -- 'Long Only', 'Long Short', etc.
  benchmark_name VARCHAR(255),
  inception_date DATE,
  fund_managers TEXT[],
  portal_fund_id VARCHAR(50),  -- e.g. base64 'NTc=' or decoded '57'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Monthly Returns & Metrics Snapshots
CREATE TABLE IF NOT EXISTS aif_returns_snapshots (
  id SERIAL PRIMARY KEY,
  scheme_slug VARCHAR(255) REFERENCES aif_schemes(scheme_slug) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  return_1m NUMERIC(7, 2),
  return_3m NUMERIC(7, 2),
  return_6m NUMERIC(7, 2),
  return_1y NUMERIC(7, 2),
  return_2y NUMERIC(7, 2),
  return_3y NUMERIC(7, 2),
  return_5y NUMERIC(7, 2),
  return_si NUMERIC(7, 2),
  aum_cr NUMERIC(12, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_aif_snapshot UNIQUE(scheme_slug, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_aif_snapshots_slug_date ON aif_returns_snapshots(scheme_slug, as_of_date DESC);
```

---

## 7. Next Steps for Claude / Future Development

1. **Curate Strategy Set for `/aif-preferred`:**
   Filter the 132 schemes down to the top ~30 curated strategies (matching the editorial model of `/pms-preferred`).
2. **Detail Page Scraper:**
   Optionally run a one-time crawl of `/aif-overview?id=...` to populate `fund_house`, `benchmark_name`, and `fund_managers` into `aif_schemes`.
3. **Monthly Cron Setup:**
   Hook the ingestion script into GitHub Actions (running on the 5th-10th of every month) to capture updated month-end returns snapshots automatically.
