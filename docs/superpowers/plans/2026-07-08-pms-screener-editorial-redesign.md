# PMS Screener Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `app/pms-screener/` from a boxy, cluttered layout into an editorial/magazine-style page (serif headings, cream page panel, featured top-performer treatment) while keeping the forest-green brand palette and every existing feature working, and make the whole page fully responsive at the site's 5 standard breakpoints.

**Architecture:** This is a visual/markup-only redesign of one route. All state, data fetching, filtering, sorting, and URL logic in `app/pms-screener/page.jsx` stays untouched — only JSX markup for specific sections (header, stat strip, top performers, table columns) and the stylesheet `app/pms-screener/pms-screener.css` change. One new piece of client state is added (a column-visibility toggle for the table). All new/changed CSS is scoped to this page only, either via class names already exclusive to this feature, or via the `#pms-screener-main` ID that already exists on the page's `<main>` element.

**Tech Stack:** Next.js 16 App Router, plain CSS (no Tailwind/CSS-in-JS), React client component (`'use client'`). No test framework is configured in this repo (`package.json` has no test script) — every task is verified manually via `npm run dev` and browser resize/devtools responsive mode.

## Global Constraints

- Forest green brand palette is reused unchanged for financial semantics: `--g1: #1b5e20`, `--g2: #2e7d32`, `--neg: #b71c1c` (defined in `app/globals.css`, do not redefine). Gains stay green, losses stay red, everywhere on this page — do not recolor `.ret-chip`/`.ret-fire`/`.ret-pos`/`.ret-neu`/`.ret-warn`/`.ret-neg`.
- Never edit `app/globals.css`. Shared global classes used on this page (`.page-title`, `.page-eyebrow`, `.page-eyebrow-text`, `.page-subtitle`, `.page-header`, `.cat-btn`, `.insight-bar`, `.section-head`, `.section-title`, `.section-badge`, `.container`) must be overridden by scoping under the `#pms-screener-main` ID selector (already present on `<main>` at `app/pms-screener/page.jsx:370`), never by editing their base definitions.
- Classes already exclusive to this feature (verified via repo-wide grep — used only in `app/pms-screener/*` and `app/api/pms-data/*`) can be edited directly without an ID-scope wrapper: `.pms-*`, `.pd-*`, `.wc-*`, `.gc-*`, `.pst-*`, `.view-btn`, `.top-perf-grid`, `.winner-card`, `.af-*`, `.cmp-*` (compare bar/modal — out of scope, see below).
- Reuse the site's existing 5 breakpoints already defined in `pms-screener.css` — 1100 / 900 / 680 / 480 / 360px. Do not introduce new breakpoint values.
- Out of scope, do not touch: `app/pms-screener/PMSCompare.jsx`, `app/pms-screener/pms-compare.css`, `lib/pmsDate.js`, `app/api/pms-data/route.js`, `app/pms-screener/layout.jsx`.
- All existing functionality must keep working exactly as before: strategy tabs, search, provider filter, table/grid view toggle, advanced filters (AUM tier, min return), compare-up-to-3, slide-out drawer, pagination, FAQ accordion, URL state (`?strategy=`, `?q=`).
- No automated tests exist for this route — each task's "test" is a manual verification checklist run against `npm run dev` at `http://localhost:3000/pms-screener`.

---

### Task 1: Editorial foundation — page-scoped tokens, cream panel, serif header

**Files:**
- Modify: `app/pms-screener/pms-screener.css` (add new section at top of file, after the file header comment at line 7)

**Interfaces:**
- Produces: CSS custom properties `--pms-bg`, `--pms-surface`, `--pms-border`, `--pms-muted`, `--pms-muted-2`, `--pms-text`, `--pms-serif`, `--pms-sans`, scoped under `#pms-screener-main`. All later tasks reference these instead of hardcoding hex values.
- No JSX changes in this task — `#pms-screener-main` already exists on `<main>` at `page.jsx:369-373`.

- [ ] **Step 1: Add the token block and page-panel styling**

Insert after line 7 (`══════...══...`) in `app/pms-screener/pms-screener.css`:

```css
/* ══════════════════════════════════════════════════════
   EDITORIAL REDESIGN — page-scoped tokens & foundation
   All tokens/overrides here are scoped under #pms-screener-main
   so no other page on the site is affected. Forest green
   (--g1/--g2/--neg from globals.css) is reused unchanged for
   financial return coloring; these new tokens are for page
   chrome only (background, borders, muted text, typography).
══════════════════════════════════════════════════════ */
#pms-screener-main {
  --pms-bg: #f7f3ec;
  --pms-surface: #fffdf8;
  --pms-border: #e8e0d0;
  --pms-muted: #9c8f78;
  --pms-muted-2: #8a7d64;
  --pms-text: #221c12;
  --pms-serif: Georgia, 'Times New Roman', serif;
  --pms-sans: Arial, Helvetica, sans-serif;

  background: var(--pms-bg);
  border-radius: 16px;
  padding: 8px 20px 32px;
  margin-top: 12px;
  margin-bottom: 12px;
}

#pms-screener-main .page-header {
  padding: 24px 8px 8px;
}

#pms-screener-main .page-eyebrow-text {
  font-family: var(--pms-sans);
}

#pms-screener-main .page-title {
  font-family: var(--pms-serif);
  font-weight: 400;
  color: var(--pms-text);
}

#pms-screener-main .page-title span {
  font-weight: 700;
}

#pms-screener-main .page-subtitle {
  font-family: var(--pms-sans);
  color: var(--pms-muted-2);
}
```

- [ ] **Step 2: Verify in browser**

Run: `npm run dev`

Open `http://localhost:3000/pms-screener` and confirm:
- The page content sits on a warm cream panel with rounded corners (not the site's default green-tinted background)
- "PMS **Screener**" title renders in a serif font, with "Screener" in the bold green accent (from `.page-title span { color: var(--g3) }` in globals.css, untouched)
- Subtitle text is sans-serif, muted brownish-grey

Then open `http://localhost:3000/market-breadth` (or any other tool page) and confirm it is **unchanged** — still the original green-tinted background and sans-serif title. This proves the override is correctly scoped to `#pms-screener-main` only.

- [ ] **Step 3: Commit**

```bash
git add app/pms-screener/pms-screener.css
git commit -m "feat(pms-screener): add editorial page-scoped tokens and cream panel foundation"
```

---

### Task 2: Stat strip → slim stat bar

**Files:**
- Modify: `app/pms-screener/page.jsx:404-436` (stat strip JSX block)
- Modify: `app/pms-screener/pms-screener.css:9-73` (remove old `.pms-stat-strip`/`.pms-stat-tile` rules), `:1061-1063`, `:1114-1117`, `:1199-1202`, `:1295-1298` (remove old breakpoint rules for `.pms-stat-strip`)

**Interfaces:**
- Consumes: `stats` object from `page.jsx` (`stats.count`, `stats.total`, `stats.avg1Y`, `stats.beatBenchmark`, `stats.totalAum`, `stats.latestCount`, `stats.prevCount`), `dataMonths.latest.shortLabel`, `dataMonths.prev.shortLabel` — all already defined, unchanged.
- Produces: new classes `.pms-stat-bar`, `.pms-stat-seg`, `.pss-label`, `.pss-val`, `.pss-sub` for later tasks/QA to reference.

- [ ] **Step 1: Replace the stat strip CSS**

In `app/pms-screener/pms-screener.css`, delete lines 9-73 (the entire `/* ── Summary strip ── */` block: `.pms-stat-strip`, `.pms-stat-tile`, `.pms-stat-tile::before`, `.pms-stat-tile:hover`, `.pms-stat-tile:hover::before`, `.pst-label`, `.pst-val`, `.pst-sub`).

Replace with:

```css
/* ── Slim stat bar ── */
.pms-stat-bar {
  display: flex;
  background: var(--pms-surface);
  border: 1px solid var(--pms-border);
  border-radius: 10px;
  padding: 14px 4px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.pms-stat-seg {
  flex: 1 1 0;
  min-width: 110px;
  padding: 0 18px;
  border-right: 1px solid var(--pms-border);
}

.pms-stat-seg:last-child {
  border-right: none;
}

.pss-label {
  font-family: var(--pms-sans);
  font-size: .6rem;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--pms-muted);
}

.pss-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--pms-text);
  margin-top: 3px;
  line-height: 1.2;
}

.pss-sub {
  font-family: var(--pms-sans);
  font-size: .58rem;
  color: var(--pms-muted);
  margin-top: 2px;
}
```

- [ ] **Step 2: Replace the stat strip breakpoint rules**

In `app/pms-screener/pms-screener.css`, find the `@media (max-width: 900px)` block and remove this rule (originally at old lines 1061-1063):

```css
  .pms-stat-strip {
    grid-template-columns: repeat(2, 1fr);
  }
```

Add in its place, inside the same `@media (max-width: 900px)` block:

```css
  .pms-stat-bar {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px 0;
  }

  .pms-stat-seg {
    border-right: none;
    padding: 6px 14px;
  }

  .pms-stat-seg:nth-child(odd) {
    border-right: 1px solid var(--pms-border);
  }
```

In the `@media (max-width: 680px)` block, remove this rule (originally at old lines 1114-1117 and 1119-1121):

```css
  .pms-stat-strip {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .pst-val {
    font-size: 1.1rem;
  }
```

(no replacement needed — the 900px 2-column rule above already covers this width)

In the `@media (max-width: 480px)` block, remove this rule (originally at old lines 1199-1202):

```css
  .pms-stat-strip {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
```

(no replacement needed, same reason)

In the `@media (max-width: 360px)` block, remove these rules (originally at old lines 1295-1306):

```css
  .pms-stat-strip {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .pst-val {
    font-size: 1.1rem;
  }

  .pst-label {
    font-size: .6rem;
  }
```

Add in its place, inside the same `@media (max-width: 360px)` block:

```css
  .pms-stat-bar {
    grid-template-columns: 1fr;
  }

  .pms-stat-seg {
    border-right: none !important;
    border-bottom: 1px solid var(--pms-border);
    padding: 8px 14px;
  }

  .pms-stat-seg:last-child {
    border-bottom: none;
  }
```

- [ ] **Step 3: Replace the stat strip JSX**

In `app/pms-screener/page.jsx`, replace lines 404-436:

```jsx
                {!loading && !error && stats && (
                    <div className="pms-stat-strip">
                        <div className="pms-stat-tile">
                            <div className="pst-label">Strategies Shown</div>
                            <div className="pst-val">{stats.count}</div>
                            <div className="pst-sub">of {stats.total} total · {strategy}</div>
                        </div>
                        <div className="pms-stat-tile">
                            <div className="pst-label">Avg 1Y Return</div>
                            <div className="pst-val" style={{ color: parseFloat(stats.avg1Y) >= 0 ? 'var(--g1)' : 'var(--neg)' }}>
                                {stats.avg1Y ? `${stats.avg1Y}%` : '—'}
                            </div>
                            <div className="pst-sub">Across visible strategies</div>
                        </div>
                        <div className="pms-stat-tile">
                            <div className="pst-label">Beat Nifty 50</div>
                            <div className="pst-val">{stats.beatBenchmark}</div>
                            <div className="pst-sub">of {stats.count} vs {BENCHMARK_1Y}% benchmark</div>
                        </div>
                        <div className="pms-stat-tile">
                            <div className="pst-label">Combined AUM</div>
                            <div className="pst-val">{fmtAum(stats.totalAum)}</div>
                            <div className="pst-sub">Under management</div>
                        </div>
                        <div className="pms-stat-tile">
                            <div className="pst-label">Data Coverage</div>
                            <div className="pst-val" style={{ fontSize: '1rem' }}>
                                {stats.latestCount} <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 400 }}>/ {stats.prevCount}</span>
                            </div>
                            <div className="pst-sub">{dataMonths.latest.shortLabel} / {dataMonths.prev.shortLabel} reporting</div>
                        </div>
                    </div>
                )}
```

with:

```jsx
                {!loading && !error && stats && (
                    <div className="pms-stat-bar">
                        <div className="pms-stat-seg">
                            <div className="pss-label">Strategies Shown</div>
                            <div className="pss-val">{stats.count}</div>
                            <div className="pss-sub">of {stats.total} total · {strategy}</div>
                        </div>
                        <div className="pms-stat-seg">
                            <div className="pss-label">Avg 1Y Return</div>
                            <div className="pss-val" style={{ color: parseFloat(stats.avg1Y) >= 0 ? 'var(--g1)' : 'var(--neg)' }}>
                                {stats.avg1Y ? `${stats.avg1Y}%` : '—'}
                            </div>
                            <div className="pss-sub">Across visible strategies</div>
                        </div>
                        <div className="pms-stat-seg">
                            <div className="pss-label">Beat Nifty 50</div>
                            <div className="pss-val">{stats.beatBenchmark}</div>
                            <div className="pss-sub">of {stats.count} vs {BENCHMARK_1Y}% benchmark</div>
                        </div>
                        <div className="pms-stat-seg">
                            <div className="pss-label">Combined AUM</div>
                            <div className="pss-val">{fmtAum(stats.totalAum)}</div>
                            <div className="pss-sub">Under management</div>
                        </div>
                        <div className="pms-stat-seg">
                            <div className="pss-label">Data Coverage</div>
                            <div className="pss-val">
                                {stats.latestCount} <span style={{ fontSize: '.65rem', color: 'var(--pms-muted)', fontWeight: 400 }}>/ {stats.prevCount}</span>
                            </div>
                            <div className="pss-sub">{dataMonths.latest.shortLabel} / {dataMonths.prev.shortLabel} reporting</div>
                        </div>
                    </div>
                )}
```

- [ ] **Step 4: Verify in browser**

Run: `npm run dev` (if not already running)

At `http://localhost:3000/pms-screener`, confirm:
- Desktop width (>900px): a single thin bordered band with 5 segments divided by vertical rules, showing the same 5 metrics as before with correct values
- Resize to ~700px (devtools responsive mode): band becomes a 2-column grid, dividers only between horizontally-adjacent segments
- Resize to ~340px: band becomes a single column, dividers become horizontal lines between segments instead of vertical

- [ ] **Step 5: Commit**

```bash
git add app/pms-screener/page.jsx app/pms-screener/pms-screener.css
git commit -m "feat(pms-screener): replace stat tile grid with slim stat bar"
```

---

### Task 3: Top performers → featured + secondary list

**Files:**
- Modify: `app/pms-screener/page.jsx:438-458` (top performers JSX block)
- Modify: `app/pms-screener/pms-screener.css:75-144` (remove old `.top-perf-grid`/`.winner-card`/`.wc-*` rules), and their breakpoint rules at old lines `1069-1071`, `1109-1112`, `1123-1125`, `1194-1197`, `1208-1219`, `1308-1310`

**Interfaces:**
- Consumes: `topPerformers` array from `page.jsx` (already computed at line 335-338, unchanged — top 4 by `ret1Y`), `setSelected(fund)` (unchanged), `fmtRet`, `fmtAum`, `BENCHMARK_1Y` (unchanged).
- Produces: new classes `.pms-perf-layout`, `.pms-perf-feature`, `.pf-rank`, `.pf-name`, `.pf-mgr`, `.pf-ret`, `.pf-meta`, `.pms-perf-secondary`, `.pf-sec-item`, `.pf-sec-name`, `.pf-sec-mgr`, `.pf-sec-ret`.

- [ ] **Step 1: Replace the top-performers CSS**

In `app/pms-screener/pms-screener.css`, delete lines 75-144 (the `/* ── Top Performers 2×2 grid ── */` block through `.wc-aum`).

Replace with:

```css
/* ── Top performer: feature + secondary list ── */
.pms-perf-layout {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 16px;
  margin-bottom: 0;
}

.pms-perf-feature {
  background: var(--pms-surface);
  border-left: 3px solid var(--g1);
  border-radius: 0 10px 10px 0;
  padding: 20px 22px;
  cursor: pointer;
  transition: box-shadow .15s;
}

.pms-perf-feature:hover {
  box-shadow: var(--shadow-lg);
}

.pf-rank {
  font-family: var(--pms-sans);
  font-size: .62rem;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--g1);
  margin-bottom: 6px;
}

.pf-name {
  font-family: var(--pms-serif);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--pms-text);
  margin-bottom: 2px;
}

.pf-mgr {
  font-family: var(--pms-sans);
  font-size: .68rem;
  color: var(--pms-muted);
  margin-bottom: 14px;
}

.pf-ret {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.9rem;
  font-weight: 700;
  color: var(--g1);
}

.pf-ret span {
  font-family: var(--pms-sans);
  font-size: .68rem;
  color: var(--pms-muted);
  font-weight: 400;
  margin-left: 6px;
}

.pf-meta {
  font-family: var(--pms-sans);
  font-size: .68rem;
  color: var(--pms-muted-2);
  margin-top: 10px;
}

.pms-perf-secondary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pf-sec-item {
  background: var(--pms-surface);
  border: 1px solid var(--pms-border);
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: border-color .15s;
}

.pf-sec-item:hover {
  border-color: var(--g3);
}

.pf-sec-name {
  font-family: var(--pms-serif);
  font-size: .78rem;
  font-weight: 700;
  color: var(--pms-text);
  display: block;
}

.pf-sec-mgr {
  font-family: var(--pms-sans);
  font-size: .62rem;
  color: var(--pms-muted);
  display: block;
  margin-top: 1px;
}

.pf-sec-ret {
  font-family: 'JetBrains Mono', monospace;
  font-size: .95rem;
  font-weight: 700;
  color: var(--g1);
  flex-shrink: 0;
  margin-left: 10px;
}
```

- [ ] **Step 2: Replace the top-performers breakpoint rules**

In the `@media (max-width: 900px)` block, remove (old lines 1069-1071):

```css
  .top-perf-grid {
    grid-template-columns: repeat(2, 1fr);
  }
```

Add in its place:

```css
  .pms-perf-layout {
    grid-template-columns: 1fr;
  }
```

In the `@media (max-width: 680px)` block, remove (old lines 1109-1112 and 1123-1125):

```css
  .top-perf-grid {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
```
```css
  .wc-ret {
    font-size: 1.1rem;
  }
```

Add in its place:

```css
  .pf-ret {
    font-size: 1.5rem;
  }
```

In the `@media (max-width: 480px)` block, remove (old lines 1194-1197 and 1208-1219):

```css
  .top-perf-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
```
```css
  /* Winner cards: compact */
  .winner-card {
    padding: 14px 14px;
  }

  .wc-name {
    font-size: .78rem;
  }

  .wc-ret {
    font-size: 1rem;
  }
```

Add in its place:

```css
  .pms-perf-feature {
    padding: 14px 16px;
  }

  .pf-name {
    font-size: 1.05rem;
  }

  .pf-ret {
    font-size: 1.3rem;
  }
```

In the `@media (max-width: 360px)` block, remove (old lines 1308-1310):

```css
  .top-perf-grid {
    grid-template-columns: 1fr;
  }
```

(no replacement needed — already 1 column from the 900px rule above)

- [ ] **Step 3: Replace the top-performers JSX**

In `app/pms-screener/page.jsx`, replace lines 438-458:

```jsx
                {!loading && !error && topPerformers.length > 0 && (
                    <div style={{ marginBottom: '28px' }}>
                        <div className="section-head">
                            <span className="section-title">🏆 Top Performers · 1Y Return</span>
                            <span className="section-badge">CLICK TO DEEP DIVE</span>
                        </div>
                        <div className="top-perf-grid">
                            {topPerformers.map((fund, i) => (
                                <div key={fund.id} className="winner-card" onClick={() => setSelected(fund)}>
                                    <div className="wc-label">#{i + 1} · {fund.portfolioManager}</div>
                                    <div className="wc-name">{fund.strategyName}</div>
                                    <div className="wc-footer">
                                        <span className="wc-ret">{fmtRet(fund.ret1Y)}</span>
                                        <span className="wc-aum">{fmtAum(fund.aum)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
```

with:

```jsx
                {!loading && !error && topPerformers.length > 0 && (
                    <div style={{ marginBottom: '28px' }}>
                        <div className="section-head">
                            <span className="section-title">🏆 Top Performer · 1Y Return</span>
                            <span className="section-badge">CLICK TO DEEP DIVE</span>
                        </div>
                        <div className="pms-perf-layout">
                            <div className="pms-perf-feature" onClick={() => setSelected(topPerformers[0])}>
                                <div className="pf-rank">#1 {strategy} Strategy</div>
                                <div className="pf-name">{topPerformers[0].strategyName}</div>
                                <div className="pf-mgr">{topPerformers[0].portfolioManager}</div>
                                <div className="pf-ret">{fmtRet(topPerformers[0].ret1Y)}<span>1Y return</span></div>
                                <div className="pf-meta">
                                    {fmtAum(topPerformers[0].aum)} AUM
                                    {topPerformers[0].ret1Y !== null && ` · ${(topPerformers[0].ret1Y - BENCHMARK_1Y >= 0 ? '+' : '')}${(topPerformers[0].ret1Y - BENCHMARK_1Y).toFixed(1)}% vs Nifty 50`}
                                </div>
                            </div>
                            {topPerformers.length > 1 && (
                                <div className="pms-perf-secondary">
                                    {topPerformers.slice(1, 4).map(fund => (
                                        <div key={fund.id} className="pf-sec-item" onClick={() => setSelected(fund)}>
                                            <span>
                                                <span className="pf-sec-name">{fund.strategyName}</span>
                                                <span className="pf-sec-mgr">{fund.portfolioManager}</span>
                                            </span>
                                            <span className="pf-sec-ret">{fmtRet(fund.ret1Y)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
```

- [ ] **Step 4: Verify in browser**

At `http://localhost:3000/pms-screener`, confirm:
- The #1 strategy by 1Y return shows as a large feature card (rank label, serif name, manager, big return figure, AUM + benchmark delta)
- Strategies #2-4 show as a compact list to the right
- Clicking either the feature card or a secondary list item opens the existing slide-out drawer showing that fund's detail (same `setSelected` behavior as before)
- Resize to ~700px: feature card and secondary list stack vertically, feature card full width on top

- [ ] **Step 5: Commit**

```bash
git add app/pms-screener/page.jsx app/pms-screener/pms-screener.css
git commit -m "feat(pms-screener): replace 4-card top performers grid with featured + secondary list"
```

---

### Task 4: Controls bar — lighter pill styling

**Files:**
- Modify: `app/pms-screener/pms-screener.css:155-236` (`.pms-search`, `.pms-provider-sel`, `.pms-count-badge`, `.view-btn`)
- Modify: `app/pms-screener/pms-screener.css` (add `#pms-screener-main .cat-btn` override — `.cat-btn` is a global class from `app/globals.css`, must be scoped, not edited at its source)

**Interfaces:**
- No JSX changes in this task — purely visual restyle. All existing `onClick`/`onChange` handlers in `page.jsx` (search input, provider select, strategy tabs, filtered/all toggle, table/grid toggle, advanced-filters toggle) are untouched.

- [ ] **Step 1: Restyle search, provider select, count badge**

In `app/pms-screener/pms-screener.css`, replace the `.pms-search` rule (lines 155-168):

```css
.pms-search {
  padding: 8px 14px;
  border: 1.5px solid var(--border2);
  border-radius: 10px;
  font-family: 'Raleway', sans-serif;
  font-size: .78rem;
  font-weight: 600;
  color: var(--text);
  background: var(--surface);
  outline: none;
  width: 200px;
  min-width: 0;
  transition: border-color .15s, box-shadow .15s;
}
```

with:

```css
.pms-search {
  padding: 9px 14px;
  border: 1px solid var(--pms-border);
  border-radius: 20px;
  font-family: var(--pms-sans);
  font-size: .78rem;
  font-weight: 400;
  color: var(--pms-text);
  background: var(--pms-surface);
  outline: none;
  width: 200px;
  min-width: 0;
  transition: border-color .15s, box-shadow .15s;
}
```

Replace `.pms-provider-sel` (lines 176-190):

```css
.pms-provider-sel {
  padding: 8px 12px;
  border: 1.5px solid var(--border2);
  border-radius: 10px;
  font-family: 'Raleway', sans-serif;
  font-size: .75rem;
  font-weight: 600;
  color: var(--text);
  background: var(--surface);
  outline: none;
  max-width: 220px;
  min-width: 0;
  cursor: pointer;
  transition: border-color .15s;
}
```

with:

```css
.pms-provider-sel {
  padding: 8px 14px;
  border: 1px solid var(--pms-border);
  border-radius: 20px;
  font-family: var(--pms-sans);
  font-size: .75rem;
  font-weight: 400;
  color: var(--pms-text);
  background: var(--pms-surface);
  outline: none;
  max-width: 220px;
  min-width: 0;
  cursor: pointer;
  transition: border-color .15s;
}
```

Replace `.pms-count-badge` (lines 196-207):

```css
.pms-count-badge {
  margin-left: auto;
  font-size: .62rem;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 20px;
  background: var(--s2);
  border: 1px solid var(--border);
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
}
```

with:

```css
.pms-count-badge {
  margin-left: auto;
  font-size: .62rem;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 20px;
  background: var(--pms-surface);
  border: 1px solid var(--pms-border);
  color: var(--pms-muted);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
}
```

Replace `.view-btn` and its `:hover`/`.active` states (lines 209-235):

```css
.view-btn {
  padding: 7px 14px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: .72rem;
  font-weight: 700;
  cursor: pointer;
  transition: .15s;
  background: var(--s2);
  color: var(--muted);
  font-family: 'Raleway', sans-serif;
  white-space: nowrap;
  min-height: 36px;
  /* touch target */
}

.view-btn:hover {
  background: var(--s3);
  border-color: var(--border2);
  color: var(--g2);
}

.view-btn.active {
  background: var(--g1);
  border-color: var(--g1);
  color: white;
}
```

with:

```css
.view-btn {
  padding: 8px 16px;
  border: 1px solid var(--pms-border);
  border-radius: 20px;
  font-size: .72rem;
  font-weight: 600;
  cursor: pointer;
  transition: .15s;
  background: var(--pms-surface);
  color: var(--pms-muted-2);
  font-family: var(--pms-sans);
  white-space: nowrap;
  min-height: 36px;
  /* touch target */
}

.view-btn:hover {
  border-color: var(--g3);
  color: var(--g2);
}

.view-btn.active {
  background: var(--g1);
  border-color: var(--g1);
  color: white;
}
```

- [ ] **Step 2: Scope-override the shared `.cat-btn` class for strategy tabs**

Add a new rule to `app/pms-screener/pms-screener.css` (anywhere after the Task 1 token block):

```css
/* Strategy tabs (.cat-btn is a shared global class — scope-override here only) */
#pms-screener-main .cat-btn {
  border-radius: 20px;
  border: 1px solid var(--pms-border);
  background: var(--pms-surface);
  font-family: var(--pms-sans);
}

#pms-screener-main .cat-btn.active {
  background: var(--g1);
  border-color: var(--g1);
}
```

- [ ] **Step 3: Verify in browser**

At `http://localhost:3000/pms-screener`, confirm:
- Search box, provider dropdown, strategy tabs, table/grid toggle, and filter buttons all show thin borders and rounded pill shapes
- Active states (selected strategy tab, active table/grid view, active "Filtered" toggle) show a solid forest-green fill
- All controls still function: typing in search filters results, changing provider filters results, clicking strategy tabs switches data, clicking Table/Grid switches view, clicking Filters toggles the advanced panel

- [ ] **Step 4: Commit**

```bash
git add app/pms-screener/pms-screener.css
git commit -m "feat(pms-screener): restyle controls bar to lighter pill treatment"
```

---

### Task 5: Table restyle + 5Y/Inception column toggle

**Files:**
- Modify: `app/pms-screener/page.jsx` (add state, modify colgroup/thead/tbody/skeleton in table view, lines ~138-159 for state, ~584-716 for table markup)
- Modify: `app/pms-screener/pms-screener.css:293-476` (table visual styling), `.pms-month-badge` colors (lines 480-494)

**Interfaces:**
- Produces: `showAllColumns` (boolean state) and `setShowAllColumns` — local to `PMSScreenerInner`, not exported, session-only (no persistence).
- Consumes: existing `paginated`, `sortCol`, `sortDir`, `handleSort`, `isComparing`, `toggleCompare`, `compareList`, `selected`, `setSelected`, `maxAum`, `fmtAum`, `fmtRet`, `getReturnClass`, `initials`, `dataMonths` — all unchanged.

- [ ] **Step 1: Add the column-toggle state**

In `app/pms-screener/page.jsx`, after line 151 (`const [showAdvanced, setShowAdvanced] = useState(false);`), add:

```jsx
    const [showAllColumns, setShowAllColumns] = useState(false);
```

- [ ] **Step 2: Update the loading skeleton to match current column count**

Replace lines 589-594:

```jsx
                                {[...Array(8)].map((_, i) => (
                                    <tr key={i} className="pms-loading-row">
                                        <td><div className="sk" style={{ width: '180px', height: '14px', marginBottom: '6px' }}></div><div className="sk" style={{ width: '120px', height: '10px' }}></div></td>
                                        {[...Array(7)].map((_, j) => <td key={j}><div className="sk" style={{ width: '52px', height: '13px', marginLeft: 'auto' }}></div></td>)}
                                    </tr>
                                ))}
```

with:

```jsx
                                {[...Array(8)].map((_, i) => (
                                    <tr key={i} className="pms-loading-row">
                                        <td><div className="sk" style={{ width: '180px', height: '14px', marginBottom: '6px' }}></div><div className="sk" style={{ width: '120px', height: '10px' }}></div></td>
                                        {[...Array(showAllColumns ? 7 : 5)].map((_, j) => <td key={j}><div className="sk" style={{ width: '52px', height: '13px', marginLeft: 'auto' }}></div></td>)}
                                    </tr>
                                ))}
```

- [ ] **Step 3: Make colgroup, thead, and empty-row colSpan conditional on column count**

Replace lines 604-621 (colgroup + comment):

```jsx
                            <table className="pms-table">
                                {/*
                                  colgroup locks column widths once — browser reads these under
                                  table-layout: fixed and never recalculates them from cell content.
                                  Total = 36 + 240 + 110 + 7×72 = 890px (> min-width: 820px ✓)
                                */}
                                <colgroup>
                                    <col style={{ width: 36 }} />   {/* ⚖ compare */}
                                    <col style={{ width: 240 }} />  {/* Strategy & Manager */}
                                    <col style={{ width: 110 }} />  {/* AUM */}
                                    <col style={{ width: 72 }} />   {/* 1M */}
                                    <col style={{ width: 72 }} />   {/* 3M */}
                                    <col style={{ width: 72 }} />   {/* 6M */}
                                    <col style={{ width: 72 }} />   {/* 1Y */}
                                    <col style={{ width: 72 }} />   {/* 3Y */}
                                    <col style={{ width: 72 }} />   {/* 5Y */}
                                    <col style={{ width: 72 }} />   {/* Inception */}
                                </colgroup>
```

with:

```jsx
                            <table className="pms-table" style={{ minWidth: showAllColumns ? 890 : 746 }}>
                                {/*
                                  colgroup locks column widths once — browser reads these under
                                  table-layout: fixed and never recalculates them from cell content.
                                  Collapsed (default): 36 + 240 + 110 + 5×72 = 746px
                                  Expanded (showAllColumns): 36 + 240 + 110 + 7×72 = 890px
                                */}
                                <colgroup>
                                    <col style={{ width: 36 }} />   {/* ⚖ compare */}
                                    <col style={{ width: 240 }} />  {/* Strategy & Manager */}
                                    <col style={{ width: 110 }} />  {/* AUM */}
                                    <col style={{ width: 72 }} />   {/* 1M */}
                                    <col style={{ width: 72 }} />   {/* 3M */}
                                    <col style={{ width: 72 }} />   {/* 6M */}
                                    <col style={{ width: 72 }} />   {/* 1Y */}
                                    <col style={{ width: 72 }} />   {/* 3Y */}
                                    {showAllColumns && <col style={{ width: 72 }} />}   {/* 5Y */}
                                    {showAllColumns && <col style={{ width: 72 }} />}   {/* Inception */}
                                </colgroup>
```

Replace lines 622-636 (thead row):

```jsx
                                <thead>
                                    <tr>
                                        <th style={{ width: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '.65rem' }} title="Add to compare (max 3)">⚖</th>
                                        <ThSort col="strategyName" label="Strategy & Manager" left sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="aum" label="AUM (Cr)" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="ret1M" label="1M" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="ret3M" label="3M" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="ret6M" label="6M" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <th onClick={() => handleSort('ret1Y')} className={sortCol === 'ret1Y' ? 'col-active' : ''} style={{ color: 'var(--g2)' }}>
                                            1Y <span className="sort-icon">{sortCol === 'ret1Y' ? (sortDir === -1 ? '▼' : '▲') : '⇅'}</span>
                                        </th>
                                        <ThSort col="ret3Y" label="3Y" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="ret5Y" label="5Y" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="retInception" label="Inception" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                    </tr>
                                </thead>
```

with:

```jsx
                                <thead>
                                    <tr>
                                        <th style={{ width: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '.65rem' }} title="Add to compare (max 3)">⚖</th>
                                        <ThSort col="strategyName" label="Strategy & Manager" left sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="aum" label="AUM (Cr)" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="ret1M" label="1M" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="ret3M" label="3M" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <ThSort col="ret6M" label="6M" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        <th onClick={() => handleSort('ret1Y')} className={sortCol === 'ret1Y' ? 'col-active' : ''} style={{ color: 'var(--g2)' }}>
                                            1Y <span className="sort-icon">{sortCol === 'ret1Y' ? (sortDir === -1 ? '▼' : '▲') : '⇅'}</span>
                                        </th>
                                        <ThSort col="ret3Y" label="3Y" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                                        {showAllColumns && <ThSort col="ret5Y" label="5Y" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                                        {showAllColumns && <ThSort col="retInception" label="Inception" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                                    </tr>
                                </thead>
```

Replace lines 678-693 (row cells for ret5M/Inception and empty-row colSpan):

```jsx
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret1M)}`}>{fmtRet(fund.ret1M)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret3M)}`}>{fmtRet(fund.ret3M)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret6M)}`}>{fmtRet(fund.ret6M)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret1Y)}`}>{fmtRet(fund.ret1Y)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret3Y)}`}>{fmtRet(fund.ret3Y)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret5Y)}`}>{fmtRet(fund.ret5Y)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.retInception)}`}>{fmtRet(fund.retInception)}</span></td>
                                        </tr>
                                    ))}
                                    {paginated.length === 0 && (
                                        <tr>
                                            <td colSpan={10} style={{ textAlign: 'center', padding: '56px', color: 'var(--muted)', fontFamily: 'Raleway' }}>
                                                No strategies match your filters.
                                            </td>
                                        </tr>
                                    )}
```

with:

```jsx
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret1M)}`}>{fmtRet(fund.ret1M)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret3M)}`}>{fmtRet(fund.ret3M)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret6M)}`}>{fmtRet(fund.ret6M)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret1Y)}`}>{fmtRet(fund.ret1Y)}</span></td>
                                            <td><span className={`ret-chip ${getReturnClass(fund.ret3Y)}`}>{fmtRet(fund.ret3Y)}</span></td>
                                            {showAllColumns && <td><span className={`ret-chip ${getReturnClass(fund.ret5Y)}`}>{fmtRet(fund.ret5Y)}</span></td>}
                                            {showAllColumns && <td><span className={`ret-chip ${getReturnClass(fund.retInception)}`}>{fmtRet(fund.retInception)}</span></td>}
                                        </tr>
                                    ))}
                                    {paginated.length === 0 && (
                                        <tr>
                                            <td colSpan={showAllColumns ? 10 : 8} style={{ textAlign: 'center', padding: '56px', color: 'var(--pms-muted)', fontFamily: 'Arial, sans-serif' }}>
                                                No strategies match your filters.
                                            </td>
                                        </tr>
                                    )}
```

- [ ] **Step 4: Add the toggle button between the table and pagination**

In `app/pms-screener/page.jsx`, find this closing structure (lines 695-698):

```jsx
                            </table>
                        </div>

                        {totalPages > 1 && (
```

Replace with:

```jsx
                            </table>
                        </div>

                        <button className="pms-col-toggle" onClick={() => setShowAllColumns(v => !v)}>
                            {showAllColumns ? '− Hide 5Y & Inception returns' : '+ Show 5Y & Inception returns'}
                        </button>

                        {totalPages > 1 && (
```

- [ ] **Step 5: Restyle the table CSS for the editorial look and add the toggle button style**

In `app/pms-screener/pms-screener.css`, replace the `.pms-table-card` rule (lines 294-301):

```css
.pms-table-card {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: var(--shadow);
  margin-bottom: 28px;
}
```

with:

```css
.pms-table-card {
  background: var(--pms-surface);
  border: 1px solid var(--pms-border);
  border-radius: var(--r);
  overflow: hidden;
  box-shadow: var(--shadow);
  margin-bottom: 28px;
}
```

Replace `.pms-table` (lines 326-334):

```css
.pms-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 820px;
  /* Fixed layout: column widths are determined by the <col> / first-row widths,
     NOT recalculated from cell content on every re-render. This prevents the
     layout-shift that occurs when sorting changes the data in each column. */
  table-layout: fixed;
}
```

with:

```css
.pms-table {
  width: 100%;
  border-collapse: collapse;
  /* min-width is now set inline per-row in page.jsx based on showAllColumns,
     since the column count itself changes (746px collapsed / 890px expanded). */
  /* Fixed layout: column widths are determined by the <col> / first-row widths,
     NOT recalculated from cell content on every re-render. This prevents the
     layout-shift that occurs when sorting changes the data in each column. */
  table-layout: fixed;
}
```

Replace `.pms-table thead tr` and `.pms-table th` (lines 336-354):

```css
.pms-table thead tr {
  background: var(--s2);
}

.pms-table th {
  padding: 11px 14px;
  font-size: .57rem;
  font-weight: 800;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1.5px solid var(--border);
  font-family: 'JetBrains Mono', monospace;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: color .15s, background .15s;
  text-align: right;
}
```

with:

```css
.pms-table thead tr {
  background: var(--pms-bg);
}

.pms-table th {
  padding: 11px 14px;
  font-size: .57rem;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--pms-muted);
  border-bottom: 1px solid var(--pms-border);
  font-family: var(--pms-sans);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: color .15s, background .15s;
  text-align: right;
}
```

Replace `.pms-table th:hover` / `.col-active` (lines 382-400):

```css
.pms-table th:hover {
  color: var(--g2);
  background: var(--s3);
}

.pms-table th.col-active {
  color: var(--g2);
}

.pms-table th .sort-icon {
  opacity: .4;
  margin-left: 3px;
  font-size: .6rem;
}

.pms-table th.col-active .sort-icon {
  opacity: 1;
  color: var(--g2);
}
```

with:

```css
.pms-table th:hover {
  color: var(--g2);
  background: var(--pms-surface);
}

.pms-table th.col-active {
  color: var(--g2);
}

.pms-table th .sort-icon {
  opacity: .4;
  margin-left: 3px;
  font-size: .6rem;
}

.pms-table th.col-active .sort-icon {
  opacity: 1;
  color: var(--g2);
}
```

Replace `.pms-table td` base rule and hover/selected states (lines 419-476):

```css
/* Base td — all body cells share these defaults */
.pms-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
  font-family: 'JetBrains Mono', monospace;
  font-size: .75rem;
  text-align: right;
  color: var(--text);
}
```

with:

```css
/* Base td — all body cells share these defaults */
.pms-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--pms-border);
  vertical-align: middle;
  font-family: 'JetBrains Mono', monospace;
  font-size: .75rem;
  text-align: right;
  color: var(--pms-text);
}
```

Find `.pms-table td:nth-child(2)` (lines 438-445) and change its `font-family`:

```css
.pms-table td:nth-child(2) {
  text-align: left;
  padding-left: 14px;
  font-family: 'Raleway', sans-serif;
  /* overflow hidden prevents the cell from escaping the <col> width */
  overflow: hidden;
}
```

with:

```css
.pms-table td:nth-child(2) {
  text-align: left;
  padding-left: 14px;
  font-family: var(--pms-sans);
  /* overflow hidden prevents the cell from escaping the <col> width */
  overflow: hidden;
}
```

Find `.pms-table tbody tr:hover td` (lines 461-463) and `.row-selected` (lines 465-467):

```css
.pms-table tbody tr:hover td {
  background: var(--s2);
}

.pms-table tbody tr.row-selected td {
  background: var(--g-xlight);
}
```

with:

```css
.pms-table tbody tr:hover td {
  background: var(--pms-bg);
}

.pms-table tbody tr.row-selected td {
  background: var(--g-xlight);
}
```

Replace `.pms-strat-name` (lines 497-507) to use the serif font:

```css
.pms-strat-name {
  font-weight: 700;
  font-size: .82rem;
  color: var(--text);
  line-height: 1.3;
  display: block;
  /* Ellipsis clip for long names under fixed-width column */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

with:

```css
.pms-strat-name {
  font-family: var(--pms-serif);
  font-weight: 700;
  font-size: .84rem;
  color: var(--pms-text);
  line-height: 1.3;
  display: block;
  /* Ellipsis clip for long names under fixed-width column */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

Update `.pms-strat-mgr` (lines 509-516) and `.pms-month-badge` (lines 480-494) colors to the new tokens:

```css
.pms-strat-mgr {
  font-size: .62rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .4px;
  display: block;
  margin-top: 2px;
}
```

with:

```css
.pms-strat-mgr {
  font-family: var(--pms-sans);
  font-size: .62rem;
  color: var(--pms-muted);
  text-transform: uppercase;
  letter-spacing: .4px;
  display: block;
  margin-top: 2px;
}
```

```css
.pms-month-badge {
  display: inline-flex;
  align-items: center;
  font-size: .57rem;
  font-family: var(--mono);
  font-weight: 500;
  background: var(--border);
  color: var(--muted);
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 6px;
  vertical-align: middle;
  letter-spacing: .02em;
  white-space: nowrap;
}
```

with:

```css
.pms-month-badge {
  display: inline-flex;
  align-items: center;
  font-size: .57rem;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  background: var(--pms-border);
  color: var(--pms-muted-2);
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 6px;
  vertical-align: middle;
  letter-spacing: .02em;
  white-space: nowrap;
}
```

Add the new toggle button style (append after the `.pms-month-badge` rule):

```css
/* Column-visibility toggle (5Y / Inception) */
.pms-col-toggle {
  display: block;
  width: 100%;
  text-align: center;
  padding: 10px;
  font-family: var(--pms-sans);
  font-size: .68rem;
  font-weight: 600;
  color: var(--g1);
  background: none;
  border: none;
  border-top: 1px dashed var(--pms-border);
  cursor: pointer;
  transition: background .15s;
}

.pms-col-toggle:hover {
  background: var(--pms-bg);
}
```

- [ ] **Step 6: Verify in browser**

At `http://localhost:3000/pms-screener`, confirm:
- The table shows exactly 8 columns by default: compare checkbox, Strategy & Manager, AUM, 1M, 3M, 6M, 1Y, 3Y
- A "+ Show 5Y & Inception returns" link/button appears below the table
- Clicking it adds 2 more columns (5Y, Inception) for a total of 10, and the button now reads "− Hide 5Y & Inception returns"
- Clicking again collapses back to 8 columns
- Sorting by clicking any column header still works in both states (try sorting by 1Y, then by 5Y after expanding)
- Selecting rows for compare (checkbox) still works and the compare bar at the bottom of the page still appears
- Clicking a row still opens the drawer with correct data
- Resize to ~375px width: the table scrolls horizontally with the existing "Swipe for more →" hint visible below it, and the whole page does not scroll horizontally (only the table itself)

- [ ] **Step 7: Commit**

```bash
git add app/pms-screener/page.jsx app/pms-screener/pms-screener.css
git commit -m "feat(pms-screener): restyle table for editorial look, add 5Y/Inception column toggle"
```

---

### Task 6: Regulatory disclosure text

**Files:**
- Modify: `app/pms-screener/page.jsx:766-770` (`.src-line`)
- Modify: `app/pms-screener/page.jsx:896-898` (`.pd-source` in drawer)
- Modify: `app/pms-screener/pms-screener.css:946-964` (`.src-line` styling — add a secondary-line style)

**Interfaces:**
- No new props/state. Pure text and minor markup change.
- The regulatory text must match `app/pms-screener/PMSCompare.jsx:278` verbatim: `Abundance Financial Services. Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered Portfolio Manager Distributor.`

- [ ] **Step 1: Update the source line at the bottom of the table**

In `app/pms-screener/page.jsx`, replace lines 765-771:

```jsx
                {/* ── Source line — dynamic month ── */}
                {!loading && !error && (
                    <div className="src-line">
                        <div className="src-dot"></div>
                        Source: APMI India · Discretionary {strategy} strategies · {dataMonths.latest.shortLabel} / {dataMonths.prev.shortLabel} · TWRR methodology · Per strategy latest available
                    </div>
                )}
```

with:

```jsx
                {/* ── Source line — dynamic month ── */}
                {!loading && !error && (
                    <div className="src-line">
                        <div className="src-line-main">
                            <span className="src-dot"></span>
                            Source: APMI India · Discretionary {strategy} strategies · {dataMonths.latest.shortLabel} / {dataMonths.prev.shortLabel} · TWRR methodology · Per strategy latest available
                        </div>
                        <div className="src-line-reg">
                            Abundance Financial Services. Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered Portfolio Manager Distributor.
                        </div>
                    </div>
                )}
```

- [ ] **Step 2: Update the drawer disclosure text**

In `app/pms-screener/page.jsx`, replace lines 896-898:

```jsx
                            <div className="pd-source" style={{ marginTop: '28px' }}>
                                <strong>Disclosure:</strong> Data from APMI India · Discretionary {strategy} strategies · Returns as of {selected.dataMonth === 'prev' ? dataMonths.prev.label : dataMonths.latest.label} · TWRR, net of all fees. Past performance is not indicative of future results. Min PMS investment ₹50L per SEBI.
                            </div>
```

with:

```jsx
                            <div className="pd-source" style={{ marginTop: '28px' }}>
                                <strong>Disclosure:</strong> Data from APMI India · Discretionary {strategy} strategies · Returns as of {selected.dataMonth === 'prev' ? dataMonths.prev.label : dataMonths.latest.label} · TWRR, net of all fees. Past performance is not indicative of future results. Min PMS investment ₹50L per SEBI.
                                <br /><br />
                                Abundance Financial Services. Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered Portfolio Manager Distributor.
                            </div>
```

- [ ] **Step 3: Update the `.src-line` CSS to support the two-line layout**

In `app/pms-screener/pms-screener.css`, replace the `.src-line` rule (lines 947-956):

```css
.src-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: .6rem;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
  margin-top: 8px;
  margin-bottom: 28px;
}
```

with:

```css
.src-line {
  margin-top: 8px;
  margin-bottom: 28px;
}

.src-line-main {
  font-size: .6rem;
  color: var(--pms-muted);
  font-family: 'JetBrains Mono', monospace;
}

.src-line-reg {
  font-size: .58rem;
  color: var(--pms-muted-2);
  font-family: var(--pms-sans);
  margin-top: 3px;
}
```

Note: `.src-dot` (line 958-964, unchanged) is now a `<span>` instead of a `<div>` per Step 1's markup change — no CSS change needed for it since `display: inline-block` isn't required (it already has fixed `width`/`height`/`border-radius` which work on inline elements too once given `display` — check the existing rule still has no explicit `display`; since it's now a `<span>` add `display: inline-block` so the width/height apply):

Replace `.src-dot` (lines 958-964):

```css
.src-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--g3);
  flex-shrink: 0;
}
```

with:

```css
.src-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--g3);
  flex-shrink: 0;
  margin-right: 8px;
  margin-top: 2px;
}
```

- [ ] **Step 4: Verify in browser**

At `http://localhost:3000/pms-screener`:
- Scroll to the bottom of the table and confirm two lines appear: the existing "Source: APMI India..." line, and a new line reading "Abundance Financial Services. Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered Portfolio Manager Distributor."
- Click any strategy row to open the drawer, scroll to the bottom, and confirm the same regulatory sentence appears after the existing disclosure paragraph
- Open the compare modal (select 2+ strategies, click Compare) and confirm its existing disclaimer text (in `PMSCompare.jsx`, untouched) still matches wording

- [ ] **Step 5: Commit**

```bash
git add app/pms-screener/page.jsx app/pms-screener/pms-screener.css
git commit -m "fix(pms-screener): add missing regulatory disclosure (name + ARN/APRN) to source line and drawer"
```

---

### Task 7: FAQ section typography

**Files:**
- Modify: `app/pms-screener/pms-screener.css:1484-1491` (`.pms-faq-title`)

**Interfaces:**
- No JSX or behavior changes — the accordion mechanics in `PMSFaqItem` (`page.jsx:62-84`) are untouched.

- [ ] **Step 1: Restyle the FAQ heading**

In `app/pms-screener/pms-screener.css`, replace `.pms-faq-title` (lines 1484-1491):

```css
.pms-faq-title {
  font-family: 'Raleway', sans-serif;
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--g1);
  letter-spacing: -.3px;
  margin: 0 0 6px;
}
```

with:

```css
.pms-faq-title {
  font-family: var(--pms-serif);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--g1);
  letter-spacing: 0;
  margin: 0 0 6px;
}
```

- [ ] **Step 2: Verify in browser**

At `http://localhost:3000/pms-screener`, scroll to the FAQ section and confirm:
- "Frequently Asked Questions" heading now renders in serif font
- Clicking a question still expands/collapses its answer as before

- [ ] **Step 3: Commit**

```bash
git add app/pms-screener/pms-screener.css
git commit -m "style(pms-screener): use serif heading for FAQ section to match editorial typography"
```

---

### Task 8: Full responsive regression pass

**Files:**
- Modify: `app/pms-screener/pms-screener.css` (only if issues are found — fixes go here, scoped the same way as prior tasks)

**Interfaces:**
- No new interfaces — this task is a verification pass across everything built in Tasks 1-7, at the site's 5 standard breakpoints. Any CSS fix must stay scoped per the Global Constraints section (never edit `app/globals.css`).

- [ ] **Step 1: Verify at 1100px (large desktop trim)**

In browser devtools, set viewport width to 1100px. At `http://localhost:3000/pms-screener`, confirm:
- Grid view shows 2 columns (existing `.pms-grid-view` rule at `pms-screener.css:1053-1057`, unaffected by this redesign)
- Stat bar, top-performer layout, table all render without horizontal overflow of the page itself

- [ ] **Step 2: Verify at 900px (tablet)**

Set viewport width to 900px. Confirm:
- Stat bar wraps to 2 columns (Task 2)
- Top-performer feature card and secondary list stack vertically (Task 3)
- Drawer opens as a full-width bottom sheet (existing `.pms-drawer` tablet rule, unaffected)
- Table scrolls horizontally without breaking page layout

- [ ] **Step 3: Verify at 680px (large phone landscape)**

Set viewport width to 680px. Confirm:
- Container side padding tightens (existing rule, unaffected)
- Search input takes a full row above the provider dropdown (existing `order: -1` rule, unaffected — verify it still applies now that `.pms-search` has new border-radius/colors from Task 4)
- Strategy tabs scroll horizontally in one row (existing `.controls-bar` rule, unaffected)
- Page title and subtitle shrink per the existing rule, still serif at reduced size

- [ ] **Step 4: Verify at 480px (small phone portrait)**

Set viewport width to 480px. Confirm:
- Top-performer feature card and secondary list are both full-width, single column
- Provider dropdown takes full width
- Drawer padding tightens (existing rule)
- Compare modal goes full-screen (existing rule, in `pms-compare.css`, unaffected — out of scope for this redesign but must still function)
- AUM mini-bar is hidden in the table (existing rule, still applies since `.aum-bar-bg` class name is unchanged)

- [ ] **Step 5: Verify at 360px (minimal phone)**

Set viewport width to 360px. Confirm:
- Stat bar collapses to a single column with horizontal dividers between segments (Task 2)
- Top-performer layout stays single column
- Strategy tabs (`.cat-btn`) shrink per the existing rule and still show the new pill shape from Task 4
- Drawer goes full-screen (existing rule)

- [ ] **Step 6: Fix any issues found**

If any breakpoint check above fails, add a targeted fix to `app/pms-screener/pms-screener.css` inside the relevant existing `@media` block (900/680/480/360), following the same scoping rules as Tasks 1-7 (page-exclusive classes edited directly, shared global classes scoped under `#pms-screener-main`). Re-run the specific breakpoint check that failed.

- [ ] **Step 7: Final full-flow smoke test**

At default desktop width, run through the complete user flow once: switch strategy tabs → search a fund → change provider filter → toggle Filtered/All Funds → open Advanced Filters, set an AUM tier, clear it → sort a column → switch to Grid view and back to Table → expand 5Y/Inception columns and collapse them again → select 2 strategies to compare and open the compare modal → close it → click a row to open the drawer → close it → paginate to page 2 (if available) → expand an FAQ item.

Confirm nothing is broken and no console errors appear (check browser devtools console).

- [ ] **Step 8: Commit (only if fixes were made in Step 6)**

```bash
git add app/pms-screener/pms-screener.css
git commit -m "fix(pms-screener): responsive polish across 900/680/480/360 breakpoints"
```

If no fixes were needed, skip this commit — Task 8 was a verification-only pass.

---

### Task 9: Extend editorial palette to drawer, grid view, and pagination

**Added after the final whole-branch review** flagged a gap between the design spec (which said the drawer and grid view should get "the same lighter visual treatment" as the rest of the page) and Tasks 1-8 (which never actually restyled them) — the drawer, grid-card view, and pagination controls still used the pre-redesign `--surface`/`--border`/`--muted`/`--text`/`--s2`/`--s3` tokens and mono-everywhere typography, so opening the drawer or switching to Grid view dropped the user out of the cream/editorial look back into the original green-tinted chrome.

**Files:**
- Modify: `app/pms-screener/pms-screener.css` (drawer section, grid-card section, pagination section)

**Interfaces:**
- No JSX changes — purely a token/typography substitution in CSS, following the exact same pattern already established in Tasks 1-7: chrome (backgrounds, borders, muted/label text, headings) moves to `--pms-*` tokens and `var(--pms-sans)`/`var(--pms-serif)`; financial gain/loss colors (`--g1`, `--g2`, `--g3`, `--g4`, `--neg`, `--g-xlight`, and any gradient using them) and all numeric VALUE fields' mono font stay completely untouched.

- [ ] **Step 1: Restyle the drawer**

In `app/pms-screener/pms-screener.css`, replace the drawer rules as follows.

Replace `.pms-drawer` (background/border only — everything else unchanged):

```css
.pms-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 100%;
  max-width: 520px;
  height: 100vh;
  height: 100dvh;
  /* dynamic viewport height for mobile */
  background: var(--surface);
  border-left: 1.5px solid var(--border);
  box-shadow: -12px 0 60px rgba(27, 94, 32, .12);
  z-index: 201;
  transform: translateX(100%);
  transition: transform .45s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

with:

```css
.pms-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 100%;
  max-width: 520px;
  height: 100vh;
  height: 100dvh;
  /* dynamic viewport height for mobile */
  background: var(--pms-surface);
  border-left: 1px solid var(--pms-border);
  box-shadow: -12px 0 60px rgba(27, 94, 32, .12);
  z-index: 201;
  transform: translateX(100%);
  transition: transform .45s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

Replace `.pd-header`:

```css
.pd-header {
  padding: 28px 32px 24px;
  background: var(--s2);
  border-bottom: 1.5px solid var(--border);
  position: relative;
  flex-shrink: 0;
}
```

with:

```css
.pd-header {
  padding: 28px 32px 24px;
  background: var(--pms-bg);
  border-bottom: 1px solid var(--pms-border);
  position: relative;
  flex-shrink: 0;
}
```

Replace `.pd-close` and `.pd-close:hover`:

```css
.pd-close {
  position: absolute;
  top: 20px;
  right: 24px;
  width: 40px;
  height: 40px;
  /* larger touch target */
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 50%;
  font-size: 18px;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: .15s;
  line-height: 1;
}

.pd-close:hover {
  background: var(--s3);
  color: var(--text);
  transform: scale(1.05);
}
```

with:

```css
.pd-close {
  position: absolute;
  top: 20px;
  right: 24px;
  width: 40px;
  height: 40px;
  /* larger touch target */
  background: var(--pms-surface);
  border: 1px solid var(--pms-border);
  border-radius: 50%;
  font-size: 18px;
  color: var(--pms-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: .15s;
  line-height: 1;
}

.pd-close:hover {
  background: var(--pms-bg);
  color: var(--pms-text);
  transform: scale(1.05);
}
```

Replace `.pd-provider`:

```css
.pd-provider {
  font-size: .62rem;
  font-weight: 800;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 6px;
  font-family: 'JetBrains Mono', monospace;
}
```

with:

```css
.pd-provider {
  font-size: .62rem;
  font-weight: 800;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--pms-muted);
  margin-bottom: 6px;
  font-family: var(--pms-sans);
}
```

Replace `.pd-name` (the fund/strategy name heading — give it the same serif treatment as `.pf-name`/`.pms-strat-name`; the green accent moves to only the return figure elsewhere in the drawer, which is unaffected by this rule):

```css
.pd-name {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--g1);
  letter-spacing: -.3px;
  line-height: 1.2;
  margin-bottom: 20px;
}
```

with:

```css
.pd-name {
  font-family: var(--pms-serif);
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--pms-text);
  letter-spacing: 0;
  line-height: 1.2;
  margin-bottom: 20px;
}
```

Replace `.pd-metric`:

```css
.pd-metric {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 12px 10px;
  text-align: center;
}
```

with:

```css
.pd-metric {
  background: var(--pms-surface);
  border: 1px solid var(--pms-border);
  border-radius: 10px;
  padding: 12px 10px;
  text-align: center;
}
```

Replace `.pdm-label` and `.pdm-val`:

```css
.pdm-label {
  font-size: .5rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 4px;
}

.pdm-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}
```

with:

```css
.pdm-label {
  font-size: .5rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--pms-muted);
  font-family: var(--pms-sans);
  margin-bottom: 4px;
}

.pdm-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  font-weight: 700;
  color: var(--pms-text);
}
```

Note: `.pdm-val`'s color is set here as a base default; the drawer's inline `style={{ color: ... }}` on the 1Y Return and vs Nifty 50 metrics (in `page.jsx`, unchanged by this task) overrides it with `var(--g2)`/`var(--neg)` for those two specific values — that inline override is untouched and still correct.

Replace `.pd-section-head`:

```css
.pd-section-head {
  font-size: .6rem;
  font-weight: 800;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 14px;
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}
```

with:

```css
.pd-section-head {
  font-size: .6rem;
  font-weight: 800;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--pms-muted);
  font-family: var(--pms-sans);
  margin-bottom: 14px;
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}
```

Replace `.pd-ret-lbl`:

```css
.pd-ret-lbl {
  font-size: .62rem;
  font-weight: 700;
  color: var(--muted);
  width: 80px;
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
}
```

with:

```css
.pd-ret-lbl {
  font-size: .62rem;
  font-weight: 700;
  color: var(--pms-muted);
  width: 80px;
  flex-shrink: 0;
  font-family: var(--pms-sans);
}
```

Replace `.sim-card` and `.sim-label` (background/border/muted only — `.sim-result`/`.sim-gain` keep their financial `--g1`/`--g2`/`--neg` colors, untouched):

```css
.sim-card {
  background: var(--g-xlight);
  border: 1.5px solid var(--border2);
  border-radius: var(--r);
  padding: 20px;
  text-align: center;
  margin-top: 4px;
}

.sim-label {
  font-size: .72rem;
  color: var(--muted);
  margin-bottom: 6px;
  line-height: 1.5;
}
```

with:

```css
.sim-card {
  background: var(--g-xlight);
  border: 1.5px solid var(--border2);
  border-radius: var(--r);
  padding: 20px;
  text-align: center;
  margin-top: 4px;
}

.sim-label {
  font-size: .72rem;
  color: var(--pms-muted);
  margin-bottom: 6px;
  line-height: 1.5;
  font-family: var(--pms-sans);
}
```

(`.sim-card`'s `--g-xlight`/`--border2` are deliberately left as-is — they signal "this is a highlighted result," which is a financial-emphasis surface, not page chrome.)

Replace `.pd-source`:

```css
.pd-source {
  font-size: .58rem;
  color: var(--muted);
  line-height: 1.6;
  margin-top: 24px;
  font-family: 'JetBrains Mono', monospace;
}
```

with:

```css
.pd-source {
  font-size: .58rem;
  color: var(--pms-muted);
  line-height: 1.6;
  margin-top: 24px;
  font-family: var(--pms-sans);
}
```

- [ ] **Step 2: Restyle the grid card view**

Replace `.pms-grid-card`:

```css
.pms-grid-card {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--r);
  padding: 20px 20px 16px;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: all .2s;
  position: relative;
  overflow: hidden;
}
```

with:

```css
.pms-grid-card {
  background: var(--pms-surface);
  border: 1px solid var(--pms-border);
  border-radius: var(--r);
  padding: 20px 20px 16px;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: all .2s;
  position: relative;
  overflow: hidden;
}
```

Replace `.gc-name`, `.gc-mgr`, `.gc-divider`, `.gc-m-label`:

```css
.gc-name {
  font-weight: 800;
  font-size: .88rem;
  color: var(--text);
  margin-bottom: 3px;
  line-height: 1.3;
}

.gc-mgr {
  font-size: .62rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .4px;
  margin-bottom: 14px;
}

.gc-divider {
  height: 1px;
  background: var(--border);
  margin-bottom: 14px;
}
```

```css
.gc-m-label {
  font-size: .52rem;
  text-transform: uppercase;
  letter-spacing: .6px;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  margin-bottom: 4px;
}
```

with:

```css
.gc-name {
  font-family: var(--pms-serif);
  font-weight: 700;
  font-size: .92rem;
  color: var(--pms-text);
  margin-bottom: 3px;
  line-height: 1.3;
}

.gc-mgr {
  font-family: var(--pms-sans);
  font-size: .62rem;
  color: var(--pms-muted);
  text-transform: uppercase;
  letter-spacing: .4px;
  margin-bottom: 14px;
}

.gc-divider {
  height: 1px;
  background: var(--pms-border);
  margin-bottom: 14px;
}
```

```css
.gc-m-label {
  font-size: .52rem;
  text-transform: uppercase;
  letter-spacing: .6px;
  color: var(--pms-muted);
  font-family: var(--pms-sans);
  font-weight: 700;
  margin-bottom: 4px;
}
```

Note: `.gc-m-val` keeps its `'JetBrains Mono', monospace` font unchanged (it renders numeric return values via inline `cagr-pos`/`cagr-neg` coloring in `page.jsx`, untouched) — do not modify `.gc-m-val`.

- [ ] **Step 3: Restyle pagination**

Replace `.pms-pagination`:

```css
.pms-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1.5px solid var(--border);
  background: var(--s2);
  flex-wrap: wrap;
  gap: 10px;
}
```

with:

```css
.pms-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--pms-border);
  background: var(--pms-bg);
  flex-wrap: wrap;
  gap: 10px;
}
```

Replace `.pg-info`:

```css
.pg-info {
  font-size: .66rem;
  font-weight: 700;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
}
```

with:

```css
.pg-info {
  font-size: .66rem;
  font-weight: 700;
  color: var(--pms-muted);
  font-family: var(--pms-sans);
}
```

Replace `.pg-btn`, `.pg-btn:hover:not(:disabled)` (the `.active` state keeps `--g1`, untouched):

```css
.pg-btn {
  padding: 6px 11px;
  border: 1.5px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--muted);
  font-size: .72rem;
  font-weight: 700;
  cursor: pointer;
  font-family: 'Raleway', sans-serif;
  transition: .15s;
  min-width: 36px;
  min-height: 36px;
  text-align: center;
}

.pg-btn:hover:not(:disabled) {
  background: var(--s3);
  border-color: var(--border2);
  color: var(--g2);
}
```

with:

```css
.pg-btn {
  padding: 6px 11px;
  border: 1px solid var(--pms-border);
  border-radius: 7px;
  background: var(--pms-surface);
  color: var(--pms-muted);
  font-size: .72rem;
  font-weight: 700;
  cursor: pointer;
  font-family: var(--pms-sans);
  transition: .15s;
  min-width: 36px;
  min-height: 36px;
  text-align: center;
}

.pg-btn:hover:not(:disabled) {
  background: var(--pms-bg);
  border-color: var(--g3);
  color: var(--g2);
}
```

Replace `.pg-size-sel`:

```css
.pg-size-sel {
  padding: 6px 10px;
  border: 1.5px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text);
  font-size: .72rem;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Raleway', sans-serif;
  outline: none;
  height: 36px;
}
```

with:

```css
.pg-size-sel {
  padding: 6px 10px;
  border: 1px solid var(--pms-border);
  border-radius: 7px;
  background: var(--pms-surface);
  color: var(--pms-text);
  font-size: .72rem;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--pms-sans);
  outline: none;
  height: 36px;
}
```

- [ ] **Step 4: Verify in browser (or via dev-server compile + code trace if no browser is available)**

Confirm:
- The drawer's background, borders, close button, labels, and the fund-name heading now use the cream/editorial palette and serif name treatment, matching the main page
- The 1Y Return / vs Nifty 50 metric values in the drawer still color green/red via their existing inline `style` (unaffected by this task)
- The wealth-simulation card's result/gain figures still color via `--g1`/`--g2`/`--neg` (unaffected)
- Grid view cards now show serif strategy names and cream/editorial chrome, matching the table view
- Pagination (both table and grid view) now uses the lighter pill/editorial treatment, with the active page button still filled forest green
- `npm run dev` compiles clean

- [ ] **Step 5: Commit**

```bash
git add app/pms-screener/pms-screener.css
git commit -m "style(pms-screener): extend editorial palette to drawer, grid view, and pagination"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Editorial direction + forest green (Task 1), stat strip→bar (Task 2), top performers featured+secondary (Task 3), controls bar pills (Task 4), table 6-col default + toggle (Task 5), regulatory disclosure (Task 6), FAQ typography (implied by "restyled to match new typography" in spec, Task 7), full responsive behavior (Task 8 + responsive rules folded into Tasks 2-5). Compare bar/modal and data-fetch/API logic are explicitly out of scope per spec and untouched throughout.
- **Placeholder scan:** No TBD/TODO; every step has complete code, not descriptions.
- **Type/name consistency:** `showAllColumns`/`setShowAllColumns` introduced in Task 5 Step 1 and used consistently through Steps 2-4 of the same task. New CSS custom properties (`--pms-*`) introduced in Task 1 are the only tokens referenced by name in Tasks 2-7 — no renaming drift.
