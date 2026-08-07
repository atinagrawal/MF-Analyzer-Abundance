/**
 * lib/schemeLineage.js
 *
 * Pre-merger scheme history for app/backtest/page.js: rebasing a
 * predecessor scheme's NAV series onto its successor's, and walking a
 * chain of such mergers backward as far as verified links go. See
 * docs/superpowers/specs/2026-08-07-scheme-lineage-backtest-history-design.md.
 *
 * CommonJS (module.exports), matching lib/portfolioAnalysis.js and
 * lib/proposalShareToken.js's dual-purpose style -- importable both via
 * Next's `import` (app/backtest/page.js, scripts/resolve_scheme_lineage.js)
 * and plain `node`/`require` (tests/schemeLineage.test.js).
 */

const DAY = 86400000;

// Return-link a predecessor series onto a current one: scale the predecessor
// so its last NAV meets the current series' first NAV (preserving
// predecessor RETURNS, not absolute NAV). Only applied if the boundary is
// genuinely continuous -- a small date gap and a sane NAV ratio -- so a
// wrong pairing can't fabricate history. Moved verbatim from
// app/backtest/page.js, unchanged.
function stitchSeries(current, pred) {
  if (!pred || pred.length < 2 || !current.length) return null;
  const cFirst = current[0], pLast = pred[pred.length - 1];
  const gapDays = (cFirst.t - pLast.t) / DAY;
  const ratio = cFirst.nav / pLast.nav;
  if (!(gapDays > 0 && gapDays <= 12 && ratio > 0.85 && ratio < 1.2)) return null; // not a clean transfer
  const k = cFirst.nav / pLast.nav;
  const head = pred.filter((p) => p.t < cFirst.t).map((p) => ({ t: p.t, nav: p.nav * k }));
  if (!head.length) return null;
  return { series: [...head, ...current], spliceDate: cFirst.t, from: pred[0].t };
}

// Walks a lineage chain backward from `code` via `lineage` (shaped like
// data/scheme-lineage.json: { [code]: { pred, from } }), splicing each
// verified predecessor hop onto `series` in turn via stitchSeries. Stops at
// the first hop with no further lineage entry, a failed predecessor fetch,
// or a failed boundary check -- keeping every earlier hop that DID verify,
// so one broken link in a long chain doesn't discard the hops closer to
// today. `fetchPredecessor(code)` and `normalize(raw)` are injected so this
// stays testable without live network calls -- the real caller in
// app/backtest/page.js passes a fetchPredecessor that hits /api/mf?code=
// and a normalize that matches its own normSeries(raw, "mf").
async function walkLineage({ series, code, lineage, fetchPredecessor, normalize }) {
  const hops = [];
  let cur = series;
  let curCode = code;
  const visited = new Set([code]);
  while (lineage[curCode]) {
    const { pred, from } = lineage[curCode];
    if (visited.has(pred)) break;
    visited.add(pred);
    let predRaw;
    try {
      predRaw = await fetchPredecessor(pred);
    } catch (e) {
      break;
    }
    if (!predRaw || !predRaw.length) break;
    const predSeries = normalize(predRaw);
    const st = stitchSeries(cur, predSeries);
    if (!st) break;
    hops.push({ spliceDate: st.spliceDate, from: st.from, fromName: from });
    cur = st.series;
    curCode = pred;
  }
  if (!hops.length) return null;
  return {
    series: cur,
    stitchInfo: {
      spliceDate: hops[0].spliceDate,
      from: hops[hops.length - 1].from,
      fromName: hops.map((h) => h.fromName).join(' ← '),
      hops,
    },
  };
}

module.exports = { stitchSeries, walkLineage };
