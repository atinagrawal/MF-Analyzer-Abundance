'use client';

// components/TransactionHistoryDrawer.jsx
//
// Per-transaction NAV rate history drawer — a "Rate Journey" strip, an
// optional NAV-history-overlay chart, plain-language commentary, and the
// full transaction table. Shared by app/cas-tracker/page.js and
// app/portfolio/page.jsx so both pages render the identical drawer.
//
// Every field it needs (date/type/amount/units/nav) comes straight out of
// the parsed CAS -- see each page's own holding-building pipeline, which
// attaches `h.transactions = scheme.transactions` -- so this never fetches
// anything on its own. The one exception is the optional full-NAV-history
// overlay, which the caller fetches lazily (via onFetchNavHistory) only
// when the user explicitly asks for it.

import { useMemo } from 'react';

const TXN_BUY_RE  = /PURCHASE|SIP|SWITCH.?IN|REINVEST|TRANSMISSION/;
const TXN_SELL_RE = /REDEMPTION|SWITCH.?OUT/;

// casparser never gives transmission (units inherited/transmitted in from
// another folio, typically on the original holder's death) its own
// transaction type -- it's folded into plain PURCHASE/PURCHASE_SIP, with
// "Transmission" only appearing in the free-text description (e.g.
// "Purchase Transmission In From F. No. 409199590893 On 17/02/2025").
// Detecting it here lets the UI label these distinctly and flag that their
// cost basis is the transmission-date rate, not the original holder's
// actual acquisition cost/date (which Section 49 says should carry over
// for capital-gains purposes, but which isn't visible from this CAS at all
// -- it lived in the deceased holder's own folio).
const TRANSMISSION_RE = /transmission/i;
export function isTransmissionTxn(description) {
  return TRANSMISSION_RE.test(description || '');
}

// Earliest date among a fund's real (financial) transactions, or null if
// there are none. Shared by the NAV-history fetch and its cache key below
// so a lookup always matches the fetch that would produce it.
export function earliestTxnDate(transactions) {
  const dates = (transactions || [])
    .filter(t => {
      const type = (t.type || '').toUpperCase();
      return parseFloat(t.nav) > 0 && (TXN_BUY_RE.test(type) || TXN_SELL_RE.test(type));
    })
    .map(t => new Date(t.date).getTime())
    .filter(t => !isNaN(t));
  return dates.length ? Math.min(...dates) : null;
}

// Keyed on both amfiCode AND the fund's earliest transaction date -- two
// different folios/family members holding the same fund can have very
// different first-purchase dates, and reusing one's cached (already
// date-filtered) NAV history for the other would silently clip real history
// off the front of their chart.
export function navHistoryCacheKey(fund) {
  if (!fund?.amfiCode) return null;
  return `${fund.amfiCode}@${earliestTxnDate(fund.transactions) ?? 'full'}`;
}

const TXN_TYPE_META = {
  PURCHASE:        { label: 'Purchase',        color: 'var(--g2)',   cls: 'buy' },
  PURCHASE_SIP:    { label: 'SIP',             color: 'var(--g3)',   cls: 'buy' },
  SWITCH_IN:       { label: 'Switch In',       color: 'var(--warn)', cls: 'switch' },
  TRANSMISSION_IN: { label: 'Transmission In', color: 'var(--muted)', cls: 'transmission' },
  REDEMPTION:      { label: 'Redemption',      color: 'var(--neg)',  cls: 'sell' },
  SWITCH_OUT:      { label: 'Switch Out',      color: 'var(--neg)',  cls: 'sell' },
};
function txnMeta(type) {
  return TXN_TYPE_META[type] || { label: type, color: 'var(--g2)', cls: 'buy' };
}
const TXN_BADGE_STYLE = {
  buy:          { bg: 'var(--g-xlight)', fg: 'var(--g1)' },
  sell:         { bg: 'var(--neg-bg)',   fg: 'var(--neg)' },
  switch:       { bg: 'var(--warn-bg)',  fg: 'var(--warn)' },
  transmission: { bg: 'var(--s2)',       fg: 'var(--muted)' },
};

// Plain, factual observations only -- no "you should" language. Returns
// JSX nodes (not HTML strings) so nothing here ever needs dangerouslySetInnerHTML.
function commentaryItems(rows, stats, currentNav, navHistory, folioTransmission) {
  const fmtD = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const multi = rows.length > 1;
  const parts = [];
  if (stats.lumpCount)        parts.push(`${stats.lumpCount} lump-sum purchase${stats.lumpCount > 1 ? 's' : ''}`);
  if (stats.sipCount)         parts.push(`${stats.sipCount} SIP installment${stats.sipCount > 1 ? 's' : ''}`);
  if (stats.switchCount)      parts.push(`${stats.switchCount} switch-in${stats.switchCount > 1 ? 's' : ''}`);
  if (stats.transmissionCount) parts.push(`${stats.transmissionCount} transmission${stats.transmissionCount > 1 ? 's' : ''} in`);
  if (stats.redeemCount)      parts.push(`${stats.redeemCount} redemption${stats.redeemCount > 1 ? 's' : ''}`);

  // Same day for every transaction (always true for exactly one) reads
  // oddly as "between 24 Feb 2026 and 24 Feb 2026" -- collapse to "on".
  const sameDate = rows[0].date.getTime() === rows[rows.length - 1].date.getTime();
  const items = [
    sameDate
      ? <>{parts.join(', ')} on <b>{fmtD(rows[0].date)}</b>.</>
      : <>{parts.join(', ')} between <b>{fmtD(rows[0].date)}</b> and <b>{fmtD(rows[rows.length - 1].date)}</b>.</>,
  ];

  if (Number.isFinite(currentNav) && stats.avgNav > 0) {
    const pct = (currentNav - stats.avgNav) / stats.avgNav * 100;
    items.push(
      <>Your {multi ? 'amount-weighted average purchase' : 'purchase'} NAV {multi ? 'is' : 'was'} <b>₹{stats.avgNav.toFixed(2)}</b>, against a
        current NAV of <b>₹{currentNav.toFixed(2)}</b> — {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%{' '}
        {pct >= 0 ? 'above' : 'below'} your {multi ? 'average entry' : 'entry'}.</>
    );
  }

  // Real CAS data (verified against an actual statement) shows the RTA
  // preserves each transaction's own original purchase date and rate when
  // a folio's history is transmitted in from another folio -- e.g. a
  // decade of monthly SIP instalments each at that month's real NAV, not
  // one bulk entry at the transmission-processing date. So the cost basis
  // and holding period computed from these should already reflect the
  // original holder's actual acquisition -- this is informational, not a
  // data-accuracy warning.
  if (stats.transmissionCount > 0) {
    items.push(
      <>{stats.transmissionCount > 1 ? <>{stats.transmissionCount} of these transactions were</> : 'One of these transactions was'} transmitted
        in from another folio{folioTransmission
          ? <> (folio <b>{folioTransmission.from_folio}</b>, previously held by <b>{folioTransmission.from_name}</b>)</>
          : ' (typically inherited)'} — your CAS preserves the original purchase date and rate for{' '}
        {stats.transmissionCount > 1 ? 'each one' : 'it'}, so {stats.transmissionCount > 1 ? "they're" : "it's"} already reflected correctly above.</>
    );
  }

  // Lowest/highest is only informative with 2+ transactions at DIFFERENT
  // rates -- for a single transaction (or several at an identical NAV,
  // e.g. same-day switches) it degenerates into repeating one number
  // twice, which reads as a copy bug rather than a real range.
  if (multi) {
    if (stats.minTxn.nav === stats.maxTxn.nav) {
      items.push(<>All {rows.length} transactions were at the same NAV: <b>₹{stats.minTxn.nav.toFixed(2)}</b>.</>);
    } else {
      items.push(
        <>Lowest entry: <b>₹{stats.minTxn.nav.toFixed(2)}</b> on {fmtD(stats.minTxn.date)} · Highest entry:{' '}
          <b>₹{stats.maxTxn.nav.toFixed(2)}</b> on {fmtD(stats.maxTxn.date)}.</>
      );
    }
  }

  if (navHistory?.points?.length) {
    const histNavs = navHistory.points.map(p => p.nav);
    const histMin = Math.min(...histNavs), histMax = Math.max(...histNavs);
    const rangeWidth = histMax - histMin;
    const describePosition = (nav) => {
      if (rangeWidth <= 0) return 'the only rate in that window';
      const frac = (nav - histMin) / rangeWidth;
      if (frac <= 0.15) return 'near the low end of that range';
      if (frac >= 0.85) return 'near the high end of that range';
      return 'roughly mid-range';
    };
    items.push(
      multi
        ? <>Across the fund's NAV history since your first purchase (<b>₹{histMin.toFixed(2)}</b>–<b>₹{histMax.toFixed(2)}</b>),
            your entries ranged <b>₹{stats.minTxn.nav.toFixed(2)}</b>–<b>₹{stats.maxTxn.nav.toFixed(2)}</b>, averaging {describePosition(stats.avgNav)}.</>
        : <>Across the fund's NAV history since your purchase (<b>₹{histMin.toFixed(2)}</b>–<b>₹{histMax.toFixed(2)}</b>),
            your entry at <b>₹{stats.minTxn.nav.toFixed(2)}</b> sits {describePosition(stats.minTxn.nav)}.</>
    );
  }
  return items;
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.62rem', color: 'var(--text2)', fontWeight: 600 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </span>
  );
}
function LegendLine({ color, label, dashed = true }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.62rem', color: 'var(--text2)', fontWeight: 600 }}>
      <span style={{ width: 16, height: 0, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </span>
  );
}

export default function TransactionHistoryDrawer({ fund, navHistory, onFetchNavHistory, onClose }) {
  const rows = useMemo(() => {
    // Some AMCs (e.g. Nippon India, via BSE StAR) tag INDIVIDUAL transmitted
    // transactions in their own description text. Others (e.g. PPFAS, via
    // CAMS) instead record a single folio-level "Transmission of Folios"
    // event with no per-transaction wording at all -- fund.folioTransmission
    // carries that (see processCasData / api/parse.py's
    // build_folio_transmission_map). When it's set, every buy in this
    // folio is known to have come via that transmission, so relabel them
    // all rather than only the (nonexistent) description-tagged ones.
    const wholeFolioTransmitted = !!fund.folioTransmission;
    return (fund.transactions || [])
      .map(t => {
        const rawType = (t.type || '').toUpperCase();
        // casparser reports transmission-in as plain PURCHASE/PURCHASE_SIP --
        // only the free-text description says "Transmission" -- so relabel
        // it here for display while still counting as a buy everywhere else
        // (TXN_BUY_RE matches TRANSMISSION_IN too).
        const type = (wholeFolioTransmitted || isTransmissionTxn(t.description)) && TXN_BUY_RE.test(rawType) ? 'TRANSMISSION_IN' : rawType;
        return {
          date: new Date(t.date),
          type,
          amount: parseFloat(t.amount) || 0,
          units: parseFloat(t.units) || 0,
          nav: parseFloat(t.nav) || 0,
        };
      })
      // Non-financial CAS rows (stamp duty, etc.) report null units/nav --
      // there's no "rate" to plot for those, so they're dropped entirely.
      .filter(t => t.nav > 0 && t.units !== 0 && !isNaN(t.date.getTime()) && (TXN_BUY_RE.test(t.type) || TXN_SELL_RE.test(t.type)))
      .sort((a, b) => a.date - b.date);
  }, [fund.transactions]);

  const hasHistory = rows.length > 0;
  const currentNav = fund.liveNav;

  const stats = useMemo(() => {
    if (!hasHistory) return null;
    const buys = rows.filter(t => TXN_BUY_RE.test(t.type));
    const totalBuyAmount = buys.reduce((s, t) => s + t.amount, 0);
    const totalBuyUnits  = buys.reduce((s, t) => s + t.units, 0);
    return {
      avgNav: totalBuyUnits > 0 ? totalBuyAmount / totalBuyUnits : 0,
      minTxn: rows.reduce((a, b) => (b.nav < a.nav ? b : a)),
      maxTxn: rows.reduce((a, b) => (b.nav > a.nav ? b : a)),
      sipCount:         rows.filter(t => t.type === 'PURCHASE_SIP').length,
      lumpCount:        rows.filter(t => t.type === 'PURCHASE').length,
      switchCount:      rows.filter(t => t.type === 'SWITCH_IN').length,
      transmissionCount: rows.filter(t => t.type === 'TRANSMISSION_IN').length,
      redeemCount:      rows.filter(t => TXN_SELL_RE.test(t.type)).length,
    };
  }, [rows, hasHistory]);

  const fmtD = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // ── "Rate Journey" strip: entry -> today, always computable from a
  // single transaction, unlike the line chart below which needs 2+ points
  // to show a trend. Doubles as the primary, unambiguous depiction of
  // avg/current NAV that a legend-only chart made easy to miss.
  const hasMultipleTxns = rows.length > 1;
  const journeyEntryNav   = hasHistory ? (hasMultipleTxns ? stats.avgNav : rows[0].nav) : null;
  const journeyEntryLabel = hasHistory ? (hasMultipleTxns ? `Since ${fmtD(rows[0].date)}` : fmtD(rows[0].date)) : '';
  const journeyPct = hasHistory && Number.isFinite(currentNav) && journeyEntryNav > 0
    ? (currentNav - journeyEntryNav) / journeyEntryNav * 100
    : null;
  const journeyUp = journeyPct == null || journeyPct >= 0;

  // ── Chart geometry (plain SVG, no charting library). A single transaction
  // has no trend of its own to draw -- but once the fund's full NAV history
  // is loaded (see the "load NAV history" affordance below), even one
  // transaction can be plotted meaningfully against that curve, so the
  // gate is "is there ANY line to draw", not just "2+ own transactions".
  const W = 640, H = 260, padL = 50, padR = 14, padT = 14, padB = 26;
  const hasHistPoints = (navHistory?.points?.length ?? 0) > 0;
  const canShowChart = hasMultipleTxns || hasHistPoints;
  let chart = null;
  if (canShowChart) {
    const histPoints = navHistory?.points || [];
    const x0 = Math.min(rows[0].date.getTime(), histPoints[0]?.t ?? Infinity);
    const x1 = Date.now();
    const navPool = rows.map(t => t.nav)
      .concat(Number.isFinite(currentNav) ? [currentNav] : [])
      .concat(stats.avgNav ? [stats.avgNav] : [])
      .concat(histPoints.map(p => p.nav));
    const yMin = Math.min(...navPool) * 0.94;
    const yMax = Math.max(...navPool) * 1.06;
    const px = (t) => padL + (t - x0) / Math.max(1, x1 - x0) * (W - padL - padR);
    const py = (v) => padT + (1 - (v - yMin) / Math.max(0.0001, yMax - yMin)) * (H - padT - padB);

    const yTicks = [0, 1, 2, 3, 4].map(i => yMin + (yMax - yMin) * i / 4);
    const startYear = new Date(x0).getFullYear(), endYear = new Date(x1).getFullYear();
    const yearTicks = [];
    for (let y = startYear; y <= endYear; y++) yearTicks.push(y);

    chart = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {yTicks.map((v, i) => (
          <g key={'y' + i}>
            <line x1={padL} x2={W - padR} y1={py(v)} y2={py(v)} stroke="var(--s3)" strokeWidth={1} />
            <text x={padL - 6} y={py(v) + 3} textAnchor="end" fontSize={9} fill="var(--muted)" fontFamily="'JetBrains Mono', monospace">₹{v.toFixed(0)}</text>
          </g>
        ))}
        {yearTicks.map(yr => {
          const t = new Date(yr, 0, 1).getTime();
          if (t < x0 || t > x1) return null;
          return (
            <g key={'x' + yr}>
              <line x1={px(t)} x2={px(t)} y1={padT} y2={H - padB} stroke="var(--s3)" strokeWidth={1} />
              <text x={px(t)} y={H - padB + 14} textAnchor="middle" fontSize={9} fill="var(--muted)" fontFamily="'JetBrains Mono', monospace">{yr}</text>
            </g>
          );
        })}
        {histPoints.length > 0 && (
          <polyline points={histPoints.map(p => `${px(p.t)},${py(p.nav)}`).join(' ')} fill="none" stroke="var(--border2)" strokeWidth={1.5} />
        )}
        {(() => {
          // Avg-NAV (dashed) and current-NAV (solid) reference lines get
          // their own inline value labels at the right edge -- distinct
          // dash pattern AND an explicit "Avg ₹x" / "Now ₹x" callout, since
          // two same-style dashed lines close together were easy to
          // mistake for one another. Nudge the labels apart when the two
          // lines land within a few px of each other.
          const avgY = py(stats.avgNav);
          const curY = Number.isFinite(currentNav) ? py(currentNav) : null;
          let avgLabelY = avgY - 5, curLabelY = curY != null ? curY - 5 : null;
          if (curY != null && Math.abs(avgY - curY) < 13) {
            if (avgY <= curY) { avgLabelY = avgY - 5; curLabelY = curY + 12; }
            else               { avgLabelY = avgY + 12; curLabelY = curY - 5; }
          }
          return (
            <>
              <line x1={padL} x2={W - padR} y1={avgY} y2={avgY} stroke="var(--g1)" strokeWidth={1.5} strokeDasharray="5,4" />
              <text x={W - padR} y={avgLabelY} textAnchor="end" fontSize={9} fontWeight="700" fill="var(--g1)" fontFamily="'JetBrains Mono', monospace">Avg ₹{stats.avgNav.toFixed(2)}</text>
              {curY != null && (
                <>
                  <line x1={padL} x2={W - padR} y1={curY} y2={curY} stroke="var(--muted)" strokeWidth={1.75} />
                  <text x={W - padR} y={curLabelY} textAnchor="end" fontSize={9} fontWeight="700" fill="var(--muted)" fontFamily="'JetBrains Mono', monospace">Now ₹{currentNav.toFixed(2)}</text>
                </>
              )}
            </>
          );
        })()}
        <polyline points={rows.map(t => `${px(t.date.getTime())},${py(t.nav)}`).join(' ')} fill="none" stroke="var(--g-light)" strokeWidth={2} />
        {rows.map((t, i) => {
          const cx = px(t.date.getTime()), cy = py(t.nav);
          const meta = txnMeta(t.type);
          const title = `${fmtD(t.date)} · ${meta.label} · ₹${Math.abs(t.amount).toLocaleString('en-IN')} · ${Math.abs(t.units).toFixed(3)} units · NAV ₹${t.nav.toFixed(2)}`;
          if (meta.cls === 'sell') {
            return <rect key={i} x={cx - 4} y={cy - 4} width={8} height={8} fill={meta.color} transform={`rotate(45 ${cx} ${cy})`}><title>{title}</title></rect>;
          }
          if (meta.cls === 'switch') {
            return <polygon key={i} points={`${cx - 5},${cy + 4} ${cx + 5},${cy + 4} ${cx},${cy - 5}`} fill={meta.color}><title>{title}</title></polygon>;
          }
          if (meta.cls === 'transmission') {
            return <rect key={i} x={cx - 3.5} y={cy - 3.5} width={7} height={7} fill={meta.color}><title>{title}</title></rect>;
          }
          return <circle key={i} cx={cx} cy={cy} r={t.type === 'PURCHASE' ? 5 : 3.5} fill={meta.color}><title>{title}</title></circle>;
        })}
        {Number.isFinite(currentNav) && (
          <circle cx={px(x1)} cy={py(currentNav)} r={4} fill="var(--muted)"><title>Today · NAV ₹{currentNav.toFixed(2)}</title></circle>
        )}
      </svg>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)' }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 'min(680px, 100vw)',
        height: '100dvh', overflowY: 'auto', background: 'var(--surface)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1.5px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
                Transaction History
              </div>
              <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.3, maxWidth: 420 }}>
                {fund.name}
              </div>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
                {fund.folio ? `Folio ${fund.folio} · ` : ''}{rows.length} transaction{rows.length !== 1 ? 's' : ''}{fund.__ownerName ? ` · ${fund.__ownerName}` : ''}
              </div>
            </div>
            <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--muted)', padding: '4px 8px', marginTop: -4 }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '20px 24px 32px', flex: 1 }}>
          {!hasHistory ? (
            <div style={{ padding: '10px 14px', background: '#fff8e1', border: '1.5px solid #ffe082', borderRadius: 10, fontSize: '.7rem', lineHeight: 1.6 }}>
              <strong style={{ color: '#f57f17' }}>⚠ No transaction-level history</strong>
              <div style={{ color: '#795548', marginTop: 3 }}>
                {fund.source === 'manual' ? (
                  <>This holding has no purchase date on record, so there's no rate to plot. Edit it to add one.</>
                ) : (
                  <>Your CAS doesn't include per-transaction detail for this fund — either a Summary CAS,
                    or units carried over from before the statement period. Download a <strong>Detailed CAS</strong> from{' '}
                    <a href="https://www.camsonline.com" target="_blank" rel="noopener noreferrer" style={{ color: '#f57f17' }}>camsonline.com</a> or{' '}
                    <a href="https://www.kfintech.com" target="_blank" rel="noopener noreferrer" style={{ color: '#f57f17' }}>kfintech.com</a> for the full rate history.</>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* ── Rate Journey: entry -> today, the clear headline comparison ── */}
              <div style={{
                border: '1.5px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 20,
                background: journeyPct == null ? 'var(--s2)' : journeyUp ? 'linear-gradient(135deg, var(--g-xlight), var(--surface) 70%)' : 'linear-gradient(135deg, var(--neg-bg), var(--surface) 70%)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: '.5rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {hasMultipleTxns ? 'Avg. Entry' : 'Entry'}
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>₹{journeyEntryNav.toFixed(2)}</div>
                    <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>{journeyEntryLabel}</div>
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0, paddingTop: 2 }}>
                    <div style={{ fontSize: '1.3rem', lineHeight: 1, color: journeyPct == null ? 'var(--muted)' : journeyUp ? 'var(--g1)' : 'var(--neg)' }}>
                      {journeyPct == null ? '—' : journeyUp ? '↗' : '↘'}
                    </div>
                    {journeyPct != null && (
                      <div style={{ fontSize: '.9rem', fontWeight: 900, color: journeyUp ? 'var(--g1)' : 'var(--neg)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {journeyUp ? '+' : ''}{journeyPct.toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '.5rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>Today</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>{Number.isFinite(currentNav) ? `₹${currentNav.toFixed(2)}` : '—'}</div>
                    <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>{fmtD(new Date())}</div>
                  </div>
                </div>
                {journeyPct != null && (
                  <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'var(--s3)', marginTop: 14 }}>
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: 4,
                      background: journeyUp
                        ? 'linear-gradient(90deg, var(--g-light), var(--g1))'
                        : 'linear-gradient(90deg, var(--neg-light), var(--neg))',
                    }} />
                    <div style={{ position: 'absolute', left: -3, top: -3, width: 14, height: 14, borderRadius: '50%', background: 'var(--surface)', border: `3px solid ${journeyUp ? 'var(--g1)' : 'var(--neg)'}` }} />
                    <div style={{ position: 'absolute', right: -3, top: -3, width: 14, height: 14, borderRadius: '50%', background: journeyUp ? 'var(--g1)' : 'var(--neg)', border: '3px solid var(--surface)' }} />
                  </div>
                )}
              </div>

              <div style={{ fontSize: '.62rem', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                NAV at Each Transaction
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              {canShowChart ? (
                <div style={{ border: '1.5px solid var(--border)', borderRadius: 12, padding: '14px 14px 10px' }}>
                  {chart}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <LegendDot color="var(--g2)" label="Purchase / SIP" />
                    <LegendDot color="var(--neg)" label="Redemption" />
                    <LegendDot color="var(--warn)" label="Switch-in" />
                    {stats.transmissionCount > 0 && <LegendDot color="var(--muted)" label="Transmission In" />}
                    <LegendLine color="var(--g1)" label="Your avg. purchase NAV" />
                    <LegendLine color="var(--muted)" label="Current NAV" dashed={false} />
                    {hasHistPoints && <LegendLine color="var(--border2)" label="Fund's NAV since your first purchase" />}
                  </div>
                  {!hasHistPoints && (
                    <div style={{ marginTop: 12 }}>
                      <button
                        onClick={onFetchNavHistory}
                        disabled={!fund.amfiCode || navHistory?.loading}
                        style={{
                          padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--border2)',
                          background: 'var(--s2)', color: 'var(--g2)', fontSize: '.68rem', fontWeight: 800,
                          cursor: fund.amfiCode ? 'pointer' : 'not-allowed', fontFamily: 'Raleway, sans-serif',
                          opacity: fund.amfiCode ? 1 : .5,
                        }}
                      >
                        {navHistory?.loading ? 'Loading…' : '📉 Overlay NAV history since your first purchase'}
                      </button>
                      {!fund.amfiCode && (
                        <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 6 }}>Scheme code not available for this fund — can't fetch its NAV history.</div>
                      )}
                      {navHistory?.error && (
                        <div style={{ fontSize: '.65rem', color: 'var(--neg)', marginTop: 6 }}>Couldn't load NAV history — try again.</div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ border: '1.5px solid var(--border)', borderRadius: 12, padding: '18px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '.74rem', color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6 }}>
                    Only one transaction on record for this holding — not enough on its own to draw a trend line.
                    Load the fund's NAV history since your purchase date to see that single entry in context instead.
                  </div>
                  <button
                    onClick={onFetchNavHistory}
                    disabled={!fund.amfiCode || navHistory?.loading}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: 'var(--g1)', color: '#fff', fontSize: '.7rem', fontWeight: 800,
                      cursor: fund.amfiCode ? 'pointer' : 'not-allowed', fontFamily: 'Raleway, sans-serif',
                      opacity: fund.amfiCode ? 1 : .5,
                    }}
                  >
                    {navHistory?.loading ? 'Loading…' : '📉 Load NAV history since your purchase'}
                  </button>
                  {!fund.amfiCode && (
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginTop: 8 }}>Scheme code not available for this fund — can't fetch its NAV history.</div>
                  )}
                  {navHistory?.error && (
                    <div style={{ fontSize: '.65rem', color: 'var(--neg)', marginTop: 8 }}>Couldn't load NAV history — try again.</div>
                  )}
                </div>
              )}

              <div style={{ fontSize: '.62rem', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--muted)', margin: '22px 0 10px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                What This Shows
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <div style={{ background: 'var(--g-xlight)', border: '1.5px solid var(--g-light)', borderRadius: 10, padding: '14px 16px' }}>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {commentaryItems(rows, stats, currentNav, navHistory, fund.folioTransmission).map((node, i) => (
                    <li key={i} style={{ fontSize: '.74rem', lineHeight: 1.7, color: 'var(--text2)', marginBottom: 4 }}>{node}</li>
                  ))}
                </ul>
                <div style={{ marginTop: 10, padding: '8px 11px', borderRadius: 7, background: 'var(--warn-bg)', borderLeft: '3px solid var(--warn)', fontSize: '.6rem', color: '#5d4037', lineHeight: 1.6, fontFamily: "'JetBrains Mono', monospace" }}>
                  ⚠ Computed from your uploaded CAS. Informational only — not investment advice. Past performance is not indicative of future results.
                </div>
              </div>

              <div style={{ fontSize: '.62rem', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--muted)', margin: '22px 0 10px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                All Transactions
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.65rem' }}>
                  <thead>
                    <tr>
                      {['Date', 'Type', 'Amount', 'Units', 'NAV'].map((h, i) => (
                        <th key={h} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '6px 8px', fontSize: '.56rem', fontWeight: 800, letterSpacing: '.4px', textTransform: 'uppercase', color: '#fff', background: 'var(--g1)', fontFamily: "'JetBrains Mono', monospace" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice().reverse().map((t, i) => {
                      const meta = txnMeta(t.type);
                      const badge = TXN_BADGE_STYLE[meta.cls];
                      return (
                        <tr key={i} style={{ background: i % 2 ? 'var(--s2)' : 'transparent' }}>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--s3)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--muted)' }}>{fmtD(t.date)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--s3)' }}>
                            <span style={{ fontSize: '.52rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: badge.bg, color: badge.fg }}>{meta.label}</span>
                          </td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--s3)', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--text2)' }}>₹{Math.abs(t.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--s3)', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--text2)' }}>{Math.abs(t.units).toFixed(3)}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--s3)', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: 'var(--text2)' }}>₹{t.nav.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
