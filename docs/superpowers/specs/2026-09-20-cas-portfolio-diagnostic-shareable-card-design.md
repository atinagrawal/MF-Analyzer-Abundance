# Factual CAS Portfolio Diagnostic & Redacted Shareable Card (Design)

**Date**: 2026-09-20  
**Status**: Revised Draft for Review  
**Author**: Antigravity Pair-Programming  
**Target Delivery**: §4.1 of `docs/SEO_GEO_GROWTH_PLAN.md`  

---

## 1. Goal & Product Vision

Provide CAS Tracker and Portfolio users with a **Factual Portfolio Diagnostic & Redacted Shareable Card** that analyzes their mutual fund holdings and enables viral, privacy-safe sharing across WhatsApp, LinkedIn, X, and direct links (`/portfolio/diagnostic/[share_token]`).

### Core Value Proposition
- **For Investors**: A clean, objective, factual diagnostic of their existing mutual fund portfolio — highlighting portfolio overlap, AMFI peer quartile distributions, and market cap allocation splits without exposing any private financial details.
- **For Abundance (Growth Loop)**: Every shared diagnostic card and link acts as an organic, regulatory-compliant acquisition funnel, driving prospective investors to upload their own CAS statements on `https://mfcalc.getabundance.in/cas-tracker`.

---

## 2. Regulatory & Compliance Boundary: AMFI MFD vs SEBI RIA

This feature operates directly at the intersection of mutual fund analytics and Indian financial regulations. Maintaining absolute regulatory integrity is paramount.

### What is Explicitly Forbidden (The RIA Boundary)
Under SEBI (Investment Advisers) Regulations, 2013 and AMFI Code of Conduct for Mutual Fund Distributors (ARN-251838):
1. **No Subjective "Portfolio Health Scores"**: Assigning a qualitative 0–100 score, letter grade (e.g. "Grade C+"), or arbitrary rating (e.g. "Poor Diversification") to an investor's specific portfolio constitutes a personalized suitability judgment and investment advice, legally restricted to SEBI Registered Investment Advisers (RIAs).
2. **No Prescriptive "Buy/Sell/Switch" Directives**: A public diagnostic must never generate automated calls to action like *"Sell Scheme X immediately"* or *"Replace Scheme Y with Scheme Z"*.
3. **No Subjective Risk Labelling**: No labelling of a portfolio as "Too Aggressive" or "Defective".

### What is Explicitly Permitted & Implemented (Factual Diagnostics)
AMFI-registered distributors are fully authorized to provide **factual, mathematical, and publicly verified comparative data**:
1. **Mathematical Portfolio Overlap**: Deterministic calculation of pairwise common security holdings (e.g., *"Parag Parikh Flexi Cap and HDFC Flexi Cap share 31% common portfolio holdings"*), based on published monthly portfolio disclosures.
2. **AMFI Category Peer Quartile Distribution**: Factual statistical placement of held funds into quartiles (Q1 Top 25%, Q2, Q3, Q4 Bottom 25%) over 1Y, 3Y, and 5Y against published AMFI peer sub-categories (reusing `lib/quartileRanking.js`).
3. **AMFI Market Cap & Asset Exposure**: Objective percentage allocation across Large Cap, Mid Cap, Small Cap, Debt, and Cash buckets based on SEBI/AMFI categorization circulars (reusing `lib/portfolioAnalysis.js`).
4. **Holdings Concentration**: Factual concentration statistics (e.g. Top 3 schemes represent 64% of total equity weight; Top 5 stocks represent 28%).

### Mandatory Regulatory Disclosure
Every shared surface (the public web page, the downloadable PNG card, and the OpenGraph preview image) must prominently display:
> *"Factual diagnostic summary compiled from published AMFI categorizations, official AMFI NAVs, and disclosed fund portfolios. This summary is strictly informational and does not constitute investment advice, financial planning, or a portfolio suitability opinion. Past performance is not indicative of future returns. Mutual fund investments are subject to market risks; read all scheme related documents carefully. Abundance Financial Services · AMFI Registered Mutual Fund Distributor · ARN-251838."*

---

## 3. Client-Side PII Redaction: Architecture & Provable Verification

Because CAS statements contain sensitive personal and financial data, **redaction occurs client-side inside the user's browser before any payload is transmitted over the network or saved to any database.** Furthermore, the server independently validates and re-derives fund metadata to guarantee that no client manipulation can inject arbitrary text.

### 3.1 What Gets Redacted (Exhaustive Inventory)

| Data Category | Raw CAS Field(s) | Redaction Action | Destination State |
| :--- | :--- | :--- | :--- |
| **Tax Identifiers** | `pan`, `__ownerPan`, `masked_pan`, `resolved_pan` | **100% Stripped** | NEVER sent to server; absent from DB & card |
| **Investor Identity** | `name`, `investorName`, `__ownerName`, `familyName`, `email`, `phone`, `address` | **100% Stripped** | Replaced with neutral, sanitized title |
| **Account Identifiers**| `folio`, `folioNumber`, `accountNumber`, `dpId`, `clientId` | **100% Stripped** | Completely omitted from all structures |
| **Monetary Values** | `value`, `currentValue`, `costValue`, `totalCost`, `gain`, `unrealizedGain`, `nav`, `units` | **100% Stripped** | Replaced with normalized, rounded **relative weight percentages** (`weightPct`) |
| **Distributor PII** | Third-party `advisor`, `arn`, `euin` | **100% Stripped** | Omitted from public payload |

### 3.2 Whitelist-Only Structural Projection

Instead of cloning the raw holdings object and deleting blacklisted fields (which is brittle and vulnerable to accidental property leakage), the system uses a **strict whitelist constructor** `sanitizeDiagnosticPayload()`.

Crucially, floating-point weights are **explicitly rounded to 2 decimal places** to avoid long trailing decimal digit runs:

```typescript
// Strict Whitelist Type Definition (Client Output)
interface RedactedScheme {
  amfiCode: number;       // Numeric AMFI scheme code (e.g. 122640)
  name: string;           // Cleaned scheme name (re-verified server-side)
  category: string;       // Normalized SEBI sub-category (re-verified server-side)
  weightPct: number;      // Relative portfolio weight: Math.round((h.value / totalValue) * 10000) / 100
}

interface RedactedDiagnosticPayload {
  title: string;          // User-customizable or default: "Mutual Fund Portfolio Diagnostic" (char-constrained)
  schemes: RedactedScheme[];
  metrics: {
    schemesCount: number;
    weightedOverlapPct: number; // Strictly bounded [0, 100]
    quartileDistribution: {
      q1Count: number;
      q2Count: number;
      q3Count: number;
      q4Count: number;
      unrankedCount: number;
    };
    mCapAllocation: {
      large: number;
      mid: number;
      small: number;
      unclassified: number;
      derivatives: number;
    };
    topOverlapPairs: Array<{
      amfiCodeA: number;
      amfiCodeB: number;
      overlapPct: number;
    }>;
  };
  asOfDate: string;       // YYYY-MM-DD format
}
```

### 3.3 The 5-Phase Pre-Flight Verification Gate (`assertZeroPII`)

Before any payload leaves the browser, a mandatory assertion gate executes. If **any** check fails, an exception is thrown, generation halts immediately, and an error banner is displayed.

1. **Phase 1: PAN Pattern Regex Scan**
   - The entire payload is serialized to a JSON string: `const rawJson = JSON.stringify(payload)`.
   - Scanned against Indian PAN regex: `/[A-Z]{5}[0-9]{4}[A-Z]/i`.
   - Scanned against masked PAN patterns: `/[A-Z]{2,5}[*X]{4,6}[A-Z0-9]/i`.
   - **Enforcement**: If regex matches, throw `PrivacyViolationError("PAN pattern detected")`.

2. **Phase 2: Folio Pattern Regex Scan**
   - Scanned against standalone folio number patterns: `/(?:^|[^\d.])\d{7,14}(?:[^\d.]|$)/` and `/\b\d{3,6}\/\d{2,6}\b/`.
   - Using non-digit/non-period boundaries ensures that clean floating-point fractions (e.g. `14.28`) cannot false-positive as a 7–14 digit folio.
   - **Enforcement**: If regex matches, throw `PrivacyViolationError("Folio pattern detected")`.

3. **Phase 3: Investor & Family Name Word-Boundary Fingerprint Matching**
   - The client collects all known personal name tokens from the active session: investor name, family name, user profile name, email prefix.
   - Tokens are split into words of length $\ge 3$ (e.g., `["puneet", "agarwal"]`).
   - Scanned using **word-boundary matching** `\b<token>\b` (with regex escaping) case-insensitively across `rawJson`.
   - Word boundaries prevent false positives on legitimate fund/AMC names (e.g. a short name token like "Sam" or "Raj" will not match "Samco" or "Rajasthan").
   - **Enforcement**: If any personal name token matches as a standalone word, throw `PrivacyViolationError("Personal name detected")`.

4. **Phase 4: Numeric Boundary & Currency Leakage Check**
   - Recursively traverses all numeric properties in the payload.
   - **Exemption Set**: Explicitly enumerates legitimate integer identifiers and counts:
     ```javascript
     const INTEGER_EXEMPT_KEYS = new Set([
       'amfiCode', 'schemesCount', 'q1Count', 'q2Count', 'q3Count', 'q4Count', 'unrankedCount'
     ]);
     ```
   - For all other numeric properties (weights, overlaps, allocations, returns):
     - Each `weightPct` must satisfy $0 \le \text{weightPct} \le 100$.
     - Sum of all `weightPct` must equal $100 \pm 0.5\%$.
     - `weightedOverlapPct` must satisfy $0 \le \text{overlap} \le 100$.
     - Each allocation component must satisfy $0 \le v \le 100$.
   - **Enforcement**: If any non-exempt numeric field exceeds `100.0`, or if any property contains keys like `value`, `cost`, `units`, `balance`, `nav`, throw `PrivacyViolationError("Monetary currency value detected")`.

5. **Phase 5: Key Whitelist Verification & Server-Side Value Re-Derivation**
   - Walks every object key in the JSON tree against an immutable `ALLOWED_KEYS` set:
     `['title', 'schemes', 'amfiCode', 'name', 'category', 'weightPct', 'metrics', 'schemesCount', 'weightedOverlapPct', 'quartileDistribution', 'q1Count', 'q2Count', 'q3Count', 'q4Count', 'unrankedCount', 'mCapAllocation', 'large', 'mid', 'small', 'unclassified', 'derivatives', 'topOverlapPairs', 'amfiCodeA', 'amfiCodeB', 'overlapPct', 'asOfDate']`.
   - **Server-Side Value Defense**: To prevent a modified client from injecting arbitrary text into string fields:
     1. The server re-derives `name` and `category` from `amfiCode` using the trusted screener dataset (`getScreenerDataset()`).
     2. `topOverlapPairs` uses `{ amfiCodeA, amfiCodeB, overlapPct }` — scheme names are resolved server-side against the trusted schemes list, preventing free-text injection.
     3. `title` is sanitized and constrained to `/^[a-zA-Z0-9\s\-()]{1,60}$/`, defaulting to `"Mutual Fund Portfolio Diagnostic"`.

### 3.4 Zero Node Dependencies in `lib/diagnosticRedaction.js`
`lib/diagnosticRedaction.js` is pure JavaScript with **zero Node-only imports** (no `crypto`, `fs`, `path`, or `https`). Token generation (`crypto.randomBytes`) lives strictly in the server API route, keeping the client bundle completely clean.

### 3.5 Pre-Share Transparency Modal
Before a user generates a link or image card, a UI modal displays the explicit privacy verification result:
- `✓ Zero PANs or Identity Numbers Included`
- `✓ Zero Folio Numbers Included`
- `✓ Zero Absolute Rupee Balances (Only Relative % Weights)`
- `✓ Zero Investor or Family Names Included`
- An expandable "Inspect Raw Redacted Data" view showing the exact JSON payload.

---

## 4. Persistence Layer & Access Model: `/portfolio/diagnostic/[share_token]`

### 4.1 Authenticated Ownership Requirement
To guarantee the user's ability to revoke or delete a public link, **creation requires a logged-in session (`auth()`)**. Anonymous creation is intentionally dropped: because CAS Tracker already requires login for all portfolio operations, requiring authentication guarantees that every public link has a verified owner who possesses the revocation killswitch.

### 4.2 Database Schema (`portfolio_diagnostics`)
Stored in PostgreSQL (`lib/db.js`). Decouples the internal database record `id` from the public `share_token`, following the established Proposal Studio pattern (`2026-08-06-proposal-studio-sharing-design.md`) and using the `gen_random_uuid()::text` cast convention:

```sql
CREATE TABLE IF NOT EXISTS portfolio_diagnostics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL,            -- High-entropy random URL token (32 hex chars, ~128 bits)
  title TEXT NOT NULL DEFAULT 'Mutual Fund Portfolio Diagnostic',
  schemes_count INT NOT NULL,
  weighted_overlap_pct NUMERIC(5, 2),          -- Weighted portfolio overlap %
  q1_equity_pct NUMERIC(5, 2),                 -- % of equity funds in Top Quartile
  payload JSONB NOT NULL,                      -- Pure redacted JSON payload (validated by assertZeroPII)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'), -- 90-day retention default
  revoked BOOLEAN NOT NULL DEFAULT FALSE,      -- Instant killswitch for the owner
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portfolio_diag_user ON portfolio_diagnostics(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_diag_share_token ON portfolio_diagnostics(share_token) WHERE NOT revoked;
```

### 4.3 Security & Access Controls
1. **Public Read Access (`/portfolio/diagnostic/[share_token]`)**:
   - Completely unauthenticated.
   - Query: `SELECT payload, title, schemes_count, weighted_overlap_pct, q1_equity_pct, created_at, expires_at FROM portfolio_diagnostics WHERE share_token = $1 AND NOT revoked AND expires_at > NOW()`.
   - Never exposes `user_id` or internal database UUIDs.
   - Revoked or expired tokens return a standard 404 (`"Diagnostic link has expired or was revoked"`).
2. **Revocation & Token Rotation**:
   - The creator can revoke access at any time: `UPDATE portfolio_diagnostics SET revoked = true, revoked_at = NOW() WHERE id = $1 AND user_id = $2`.
   - The public link immediately stops serving data, and its OpenGraph image URL returns 404.
   - The owner can also **rotate the share token** without deleting the underlying diagnostic.
3. **Retention & TTL**:
   - Default retention is **90 days**.
   - Query-time filtering enforces expiration (`expires_at > NOW()`), preventing stale snapshots from lingering. A lightweight nightly maintenance task can prune expired rows.

---

## 5. Diagnostic Engine & Analytical Content

### 5.1 Mathematical Portfolio Overlap: Dimensionally Sound Formula

Let $N$ be the number of schemes in the portfolio.  
Let $w_i = \frac{\text{weightPct}_i}{100}$ be the fractional portfolio weight of scheme $i$, such that $\sum_{i=1}^N w_i = 1$.  
Let $\text{Overlap}(i, j) \in [0, 100]$ be the pairwise common holdings overlap percentage between scheme $i$ and scheme $j$ (from `computeOverlap(funds)` in `lib/portfolioAnalysis.js`).

The **Portfolio Weighted Overlap Percentage** is defined as the product-weighted average across all unique scheme pairs $(i < j)$:

$$\text{Portfolio Weighted Overlap \%} = \frac{\sum_{i < j} w_i \cdot w_j \cdot \text{Overlap}(i, j)}{\sum_{i < j} w_i \cdot w_j}$$

#### Worked Numeric Examples

**Example 1: Two-Fund Portfolio**  
- Fund 1 weight = 50% ($w_1 = 0.50$), Fund 2 weight = 50% ($w_2 = 0.50$).
- Pairwise Overlap = 30%.
- Numerator: $w_1 \cdot w_2 \cdot \text{Overlap}(1, 2) = 0.50 \times 0.50 \times 30 = 7.50$.
- Denominator: $w_1 \cdot w_2 = 0.50 \times 0.50 = 0.25$.
- $\text{Weighted Overlap} = \frac{7.50}{0.25} = 30.0\%$. Exactly matches the pairwise overlap.

**Example 2: Three-Fund Equal Portfolio**  
- Three funds with equal weight: $w_1 = w_2 = w_3 = \frac{1}{3} \approx 0.3333$.
- Pairwise Overlaps: $\text{Overlap}(1, 2) = 30\%$, $\text{Overlap}(1, 3) = 10\%$, $\text{Overlap}(2, 3) = 20\%$.
- Numerator: $\left(\frac{1}{9} \times 30\right) + \left(\frac{1}{9} \times 10\right) + \left(\frac{1}{9} \times 20\right) = \frac{60}{9} \approx 6.6667$.
- Denominator: $\frac{1}{9} + \frac{1}{9} + \frac{1}{9} = \frac{3}{9} = \frac{1}{3} \approx 0.3333$.
- $\text{Weighted Overlap} = \frac{6.6667}{0.3333} = 20.0\%$. Dimensionally sound, bounded in $[0, 100]\%$.

**Single-Fund Portfolio Guard**:  
If $N = 1$, pairwise overlap is mathematically undefined (no pairs exist). In this case, `weightedOverlapPct = null`, and the UI renders a clean badge: *"Single Scheme Portfolio — No Pairwise Overlap"*.

### 5.2 AMFI Category Peer Quartile Distribution (`lib/quartileRanking.js`)
- Ranks each scheme against every other Regular-Growth scheme in its exact SEBI sub-category using `buildQuartileReport(schemes, screenerFunds)`.
- Generates the **Quartile Distribution Breakdown**:
  - Quartile 1 (Top 25% of peers in category over 3Y/5Y).
  - Quartile 2 (Above Median).
  - Quartile 3 (Below Median).
  - Quartile 4 (Bottom 25% of peers in category).
- Strictly displays **proportions and counts** (e.g., *"3 Schemes in Top Quartile, 2 Schemes in Median, 1 Scheme in Bottom Quartile"*). Zero subjective commentary.

### 5.3 Market Cap & Asset Allocation Split (`lib/portfolioAnalysis.js`)
- Computes aggregate equity market-cap exposure via `computeMCapAllocation()`:
  - Large Cap %
  - Mid Cap %
  - Small Cap %
  - Unclassified / Derivatives %
- Compares against broader market benchmarks (Nifty 500 cap distribution) purely as a factual comparison benchmark.

---

## 6. Visual Presentation & Shareable Assets

### 6.1 Public Interactive Web Route: `app/portfolio/diagnostic/[share_token]/page.jsx`
- Clean, high-performance, mobile-first page.
- Components:
  1. **Branded Header**: Abundance logo, AMFI registration disclosure, Diagnostic Title, As-of Date.
  2. **Hero Stat Grid**:
     - Schemes Analyzed (e.g. `6 Schemes`)
     - Weighted Overlap (e.g. `24.5%`)
     - Equity in Top Quartile (e.g. `50%`)
     - Asset Split (Equity % / Debt % / Cash %)
  3. **Peer Quartile Summary Chart**: Clean horizontal stacked bar showing Q1 / Q2 / Q3 / Q4 fund distribution.
  4. **Pairwise Overlap Table**: Highlights schemes sharing significant common holdings with visual overlap percentage bars.
  5. **Market Cap Distribution**: Large / Mid / Small cap visual bar.
  6. **Call-to-Action (Growth Funnel)**:
     - Card: *"Track & Analyze Your Own Portfolio with Abundance CAS Tracker"*
     - Direct button to `https://mfcalc.getabundance.in/cas-tracker` with UTM tracking: `?utm_source=diagnostic_share&utm_medium=card&utm_campaign=cas_plg`.
  7. **Regulatory Footer**: Mandatory ARN-251838 distributor disclosure.

### 6.2 Dynamic OpenGraph Preview: `app/api/og-diagnostic/[share_token]/route.js`
- Edge runtime `@vercel/og` route generating 1200×630 PNG.
- Layout:
  - Forest green brand gradient (`#071708` → `#0d2b0d` → `#153b17`).
  - Top accent bar (`#00897b` → `#2e7d32` → `#66bb6a`).
  - Official logo mark + "PORTFOLIO DIAGNOSTIC".
  - Clean metrics display:
    - Schemes Count pill (e.g. `7 Funds`)
    - Portfolio Overlap badge (e.g. `28% Overlap`)
    - Quartile Distribution pill (e.g. `60% in Top 2 Quartiles`)
    - Market Cap breakdown (e.g. `65% Large · 25% Mid · 10% Small`)
  - Regulatory footer with ARN-251838.

### 6.3 Client-Side Downloadable PNG Card
- Exportable high-resolution card generated directly in the browser via HTML5 Canvas.
- Allows immediate one-tap sharing to WhatsApp groups and personal chats as an image file.

---

## 7. Execution Phases & Milestones

| Phase | Milestone | Deliverables | Verification Criteria |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Redaction & Verification Engine** | `lib/diagnosticRedaction.js`<br>`tests/diagnosticRedaction.test.js` | Unit tests verify: 100% rejection of PANs, names, folios, monetary numbers $> 100$; weighted overlap dimensional sanity; word-boundary name checks; zero Node-only imports. |
| **Phase 2** | **Persistence & API Layer** | `scripts/schema.sql`<br>`app/api/portfolio/diagnostic/create/route.js`<br>`app/api/portfolio/diagnostic/[share_token]/route.js`<br>`app/api/portfolio/diagnostic/revoke/route.js` | Database persistence, 128-bit token generation, public read endpoint, owner revocation, server-side value re-derivation. |
| **Phase 3** | **Dynamic OG Card** | `app/api/og-diagnostic/[share_token]/route.js` | Returns valid 1200×630 PNG with correct headers and visual card layout. |
| **Phase 4** | **Public View Page & UI Integration** | `app/portfolio/diagnostic/[share_token]/page.jsx`<br>CAS Tracker "Share Diagnostic" modal | End-to-end flow: CAS Tracker → Privacy Modal → Share Link → Public Page with CTA. |
