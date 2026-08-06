# Scheme Lineage — Extending Backtest Pre-Merger History Design

## Goal

Extend `app/backtest/page.js`'s existing "pre-merger history" feature — currently hand-curated for exactly one merger (JPMorgan → Edelweiss) — to cover the ~20 scheme-level "merged into" events documented in the user's reference file, so a fund whose predecessor scheme was absorbed into it shows its true, longer track record in backtest rather than appearing to have launched on the merger date.

## Background: what already exists

`app/backtest/page.js` already has the exact mechanism this work extends — nothing new is being built, only scaled up:

- **`LINEAGE`** (currently 2 entries): a plain object keyed by a scheme's *current* AMFI code → `{ pred: predecessorCode, from: predecessorName }`.
- **`stitchSeries(current, pred)`**: rebases the predecessor's NAV series so its last value meets the current series' first value (preserving the predecessor's *returns*, not its absolute NAV — a scale factor `k = currentFirst.nav / predLast.nav` applied to every predecessor point), then prepends it. Refuses to splice at all unless the boundary is "clean": the date gap between the two series is `> 0 && <= 12` days, and the NAV ratio at the boundary is between `0.85` and `1.2`. This check is the load-bearing safety net — a wrong/bad `LINEAGE` entry simply fails to splice rather than fabricating a misleading history.
- **UI**: a "Include pre-merger history where available" checkbox (default on), a dashed splice-date marker on the backtest chart, and explanatory notes in the results summary, per-fund drawer, and PDF export naming the linked predecessor fund.
- **Live-verified during brainstorming**: mfapi.in continues to serve a merged-away scheme's full frozen NAV history via direct code lookup (`/mf/{code}`) even once it's no longer searchable by name — confirmed against L&T Emerging Businesses Fund (code 129223, history 2014-05-15 through its 2022-11-24 merger-freeze date). This means every predecessor fetch can keep going through this app's own existing `/api/mf?code=` route exactly as the JPMorgan entry does today — no new fetching infrastructure needed.

## Source data

The user maintains a reference file (`C:\Users\Atin\Desktop\mf_AMC_merger.txt`) documenting 27 AMC merger/acquisition/rebranding events (1993–2026) in the Indian mutual fund industry, each broken down to individual scheme names using one of these labels:

- **"Renamed to"** — the scheme continues under a new brand name. **Confirmed live during brainstorming** (Bandhan Flexi Cap Fund, renamed from IDFC in March 2023, already has continuous NAV history back to 2008 under its current code): a pure rename keeps the same AMFI scheme code, so mfapi.in already serves continuous history with zero fragmentation. **These need no `LINEAGE` entry — already correct today.**
- **"Merged into"** — the old scheme was discontinued and unit holders migrated into a *different*, already-existing scheme. **Confirmed live** (L&T Emerging Businesses Fund → HSBC Small Cap Fund, November 2022): the surviving scheme's own history starts right at the merger date, and its true pre-merger track record lives under the old scheme's now-delisted code. **These are the actual gap this work closes.**
- A few entries use other phrasing ("Restructured into" for the Escorts → Quant events; plain unlabeled arrow-chains for a handful of multi-step lineages like ABN AMRO → Fortis → BNP Paribas → Baroda BNP Paribas) whose rename-vs-merge classification isn't stated explicitly. These are treated as merge-candidates (attempted for resolution, gated by the same boundary safety check) rather than assumed to need no work — see "Resolution rules" below.
- Two chains terminate in a fund SEBI wound up entirely with no surviving successor (Sahara Mutual Fund's schemes, cancelled 2015–2023; CRB Mutual Fund, liquidated 1997) — including First India Mutual Fund's schemes, which were renamed into Sahara before Sahara itself was wound up, so that whole sub-chain has no living fund today either. **Excluded entirely** — there is nothing to attach extended history to.

**The reference file will be copied into this repo** (e.g. `docs/mf-amc-merger-reference.txt`) so it's version-controlled and the resolution script (below) can read it without depending on a path on the user's Desktop. Any future addition to the file (a new merger) can be re-run through the same script.

## Resolution rules

For each scheme mentioned in the source file:

1. **"Renamed to"** → skip. No `LINEAGE` entry needed.
2. **"Merged into", "Restructured into", or an unlabeled arrow-chain step** → attempt resolution (below). If resolution or the boundary check fails, the pair is simply omitted — never forced in.
3. **A chain whose current end has no living scheme today** (wound up, license cancelled) → skip entirely, no resolution attempted.
4. **Multi-hop chains** (e.g. Benchmark BeES → Goldman Sachs BeES → Reliance ETF BeES → Nippon India ETF BeES across three separate merger events) → each hop is resolved and validated independently, as its own `{oldName, newName, mergerDate}` triple, using each hop's own approximate date from the source file. Each hop becomes its own `LINEAGE` entry, keyed by the code that comes immediately after it in the chain (see Data Model). The runtime loader walks the chain hop-by-hop (see Runtime Changes) — a chain is only as long as its weakest verified link; a failed hop stops the walk there without breaking the hops that did verify.

## Resolution script

A one-time Node script, `scripts/resolve_scheme_lineage.js`, run manually (not scheduled — mergers are rare, discrete events). Input: a small structured array of `{ oldName, newName, mergerDate }` transcribed from the copied reference file, one row per scheme-level hop that needs resolution per the rules above.

For each row:

1. **Resolve the surviving fund's current codes** — search mfapi.in (`/mf/search`), matching Direct/Regular × Growth/IDCW plan variants, the same matching approach `FundPicker` already uses elsewhere in this app.
2. **Resolve the predecessor's dead codes** — download AMFI's historical NAV report (`DownloadNAVHistoryReport_Po.aspx?frmdt=...&todt=...`) for a narrow window around `mergerDate`, and extract the matching scheme's code + ISIN per plan variant. **Confirmed live** this endpoint still returns full plan-variant detail (code, ISIN, NAV) for schemes that no longer exist today. Since this endpoint returns the *entire market's* data for the requested window (confirmed ~13MB for an 11-month range), the script fetches one window per distinct merger date across the whole input list, not one per fund, and reuses it for every scheme sharing that date.
3. **Confirm the dead code is still directly queryable via mfapi.in** (`/mf/{code}`) — the source this app's own `/api/mf` route will actually use at runtime. If a resolved code doesn't resolve there, the pair is flagged unresolved rather than guessed at.
4. **Pre-flight boundary check** — apply the exact same rule `stitchSeries()` already enforces at runtime (date gap `>0 && <=12` days, NAV ratio boundary `0.85–1.2`) as a filter, so an obviously bad pairing never reaches the review step.
5. **Write a review file** (plain text/markdown, not auto-committed) listing every candidate `LINEAGE` entry: both fund names, both codes, the computed gap/ratio, and pass/fail — for a human skim before anything is merged into the real data file.

Only entries confirmed after review are added to `data/scheme-lineage.json`.

## Data model

`LINEAGE` moves out of `app/backtest/page.js` (currently a 2-entry inline object) into `data/scheme-lineage.json`, since it will grow to roughly 40–80 entries once multi-hop chains are flattened into individual hop-links across plan variants. Same shape as today, just larger and externalized:

```json
{
  "140225": { "pred": 107301, "from": "JPMorgan India Mid and Small Cap Fund (Regular)" },
  "140228": { "pred": 119869, "from": "JPMorgan India Mid and Small Cap Fund (Direct)" }
}
```

`app/backtest/page.js` imports this file in place of the current inline `const LINEAGE = {...}`. No other part of the app reads it — this stays scoped to backtest, where the pre-merger-history feature already lives, per the "consumer" decision made during brainstorming (NAV-chart-level display, and backtest is the only page with an actual NAV chart today).

The 2 existing entries (JPMorgan India Mid and Small Cap Fund → Edelweiss Mid Cap Fund, both plan variants) migrate into `data/scheme-lineage.json` unchanged as the seed of the file. The source reference file separately lists "JPMorgan India Midcap Fund → Merged into Edelweiss Mid Cap Fund" — the resolution script's own name-matching (step 1–3 above) will determine during the review step whether this is the same fund under slightly different phrasing (in which case the existing entry is left as-is, already correct) or a genuinely distinct scheme (in which case it's added as a new entry). No entry is overwritten without appearing in the review file first.

## Runtime changes

`loadSeries()`'s existing single-hop splice (`if (stitch && LINEAGE[item.id]) { ...fetch LINEAGE[item.id].pred, stitchSeries once... }`) becomes a loop: after a successful splice, check whether the just-spliced predecessor's own code also has a `LINEAGE` entry, and if so, fetch and splice that one too (through the same existing `/api/mf?code=` route and the same `stitchSeries()` boundary check), continuing until no further predecessor exists or a hop fails the boundary check. Each successfully-spliced hop is recorded so the UI can name the full chain in its notes (e.g. "Nippon India ETF Nifty 50 BeES ← Reliance ETF Nifty BeES ← Goldman Sachs Nifty BeES ← Benchmark Nifty BeES, back to <date>"), extending the existing single-predecessor note format rather than replacing it.

## Testing

- `stitchSeries()`'s boundary-check math (gap/ratio thresholds) is already a pure function — add `tests/stitchSeries.test.js` covering: a clean splice, a gap too large, a ratio out of bounds, and a multi-hop chain where the second hop fails (confirming the chain stops there without dropping the first hop's already-valid splice).
- The resolution script's scheme-code discovery (mfapi.in search, AMFI historical downloads) can't be unit-tested without live network access, same limitation as this app's other sync/backfill scripts — verified manually against known pairs (L&T Emerging Businesses Fund → HSBC Small Cap Fund, already confirmed live during brainstorming) before the review file is generated for real.

## Out of scope

- Screener and Proposal Studio — neither currently renders a NAV history chart; this stays scoped to backtest.
- Any merger not present in the user's reference file — no attempt to independently discover other AMC mergers.
- Automatically re-running the resolution script on a schedule — mergers are rare; re-run manually if the reference file gains new entries.
- The two wound-up-with-no-successor chains (Sahara, CRB) and any lineage that terminates in them (e.g. First India → Sahara).
