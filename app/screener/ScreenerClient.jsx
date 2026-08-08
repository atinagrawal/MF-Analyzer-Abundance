'use client';

import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getMFLogo, getSIFLogo } from '@/lib/providerLogos';
import { MFCompareBar, MFCompareModal } from './MFCompare';
import CompareGrowthChart from './CompareGrowthChart';
import HoldingsSection from './HoldingsSection';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { startCheckout } from '@/lib/checkoutClient';
import { shortCat, FAQ_ITEMS, GLOSSARY_ITEMS, CURATED_CATEGORIES, categoryToSlug, matchCategory, normalizeCategory } from './screenerContent';
import { normalizeSchemeName } from '@/lib/normalizeSchemeName';

// Slim, server-fetched projection of data/isin-scheme-master.json (see
// app/api/scheme-master-facts/route.js) — fetched once and cached across
// every Detail drawer mount, rather than importing the full 5.6MB file into
// this page's client bundle.
let schemeMasterFactsPromise = null;
function getSchemeMasterFacts() {
  if (!schemeMasterFactsPromise) {
    schemeMasterFactsPromise = fetch('/api/scheme-master-facts')
      .then(r => r.ok ? r.json() : { byIsin: {}, byAmfiCode: {}, byNormName: {} })
      .catch(() => ({ byIsin: {}, byAmfiCode: {}, byNormName: {} }));
  }
  return schemeMasterFactsPromise;
}

/* ---------- SIF helpers ---------- */
const SIF_STRATEGY_LABELS = {
  'Equity Oriented Investment Strategies - Equity Ex-Top 100 Long-Short Fund': 'Equity Ex-Top 100 L/S',
  'Equity Oriented Investment Strategies - Equity Long-Short Fund': 'Equity Long-Short',
  'Hybrid Investment Strategies - Active Asset Allocator Long-Short Fund': 'Active Asset Allocator',
  'Hybrid Investment Strategies - Hybrid Long-Short Fund': 'Hybrid Long-Short',
};
const sifStratShort = (cat) => SIF_STRATEGY_LABELS[cat] || cat?.split(' - ')[1] || cat || '—';
const sifFamily = (cat) => cat?.startsWith('Equity') ? 'Equity' : 'Hybrid';
// Longest-duration-first list of periods leader cards will try per category
// -- same list and "needs >=2 comparable funds" rule already used by the
// comparison feature's category peer-rank (app/screener/compareEngine.js's
// RANK_PERIOD_FALLBACK/pickCommonRankPeriod), applied here per-category
// instead of per-comparison-set: a category with older funds might rank by
// 1Y while an all-brand-new category ranks by 1M, shifting automatically
// as SIFs age with no future code changes needed.
const LEADER_PERIOD_FALLBACK = [
  { key: 'ret_3y', label: '3Y' },
  { key: 'ret_1y', label: '1Y' },
  { key: 'ret_6m', label: '6M' },
  { key: 'ret_3m', label: '3M' },
  { key: 'ret_1m', label: '1M' },
];
function pickCategoryLeaderPeriod(categorySchemes) {
  for (const period of LEADER_PERIOD_FALLBACK) {
    if (categorySchemes.filter((s) => s[period.key] != null).length >= 2) return period;
  }
  return null;
}
// Same fallback list, but for the table's DEFAULT sort column -- picks the
// longest period MOST (>50%) of all SIF schemes actually have, capping at
// 3Y same as the leader cards. Shifts automatically as SIFs age (1M today,
// eventually 3Y) with no future code change needed. Returns null if not
// even 1M has a majority yet, in which case the caller falls back to NAV.
function pickDefaultSortPeriod(schemes) {
  if (!schemes.length) return null;
  for (const period of LEADER_PERIOD_FALLBACK) {
    if (schemes.filter((s) => s[period.key] != null).length > schemes.length / 2) return period;
  }
  return null;
}
// Same idea, but picks `count` return-period COLUMNS for the SIF table's
// default (mobile) view instead of a single sort key -- prefers the
// LONGEST periods a majority of schemes actually have, capping at 5Y (same
// ceiling as MF's own DEFAULT_COLS, deliberately shorter than METRICS'
// full 1M..10Y range since 7Y/10Y are unrealistic defaults for a fund
// category that's only existed since 2024-25). Falls back to whichever
// periods have ANY data at all once fewer than `count` clear the majority
// bar, so a brand-new dataset still shows *something* useful. Returns null
// if there's no data yet at all, in which case the caller falls back to
// the same static 1Y/3Y/5Y MF uses.
const SIF_COL_PERIODS_ASC = ['ret_1m', 'ret_3m', 'ret_6m', 'ret_1y', 'ret_3y', 'ret_5y'];
function pickDefaultSifReturnCols(schemes, count = 3) {
  if (!schemes.length) return null;
  const desc = [...SIF_COL_PERIODS_ASC].reverse();
  const majority = desc.filter((key) => schemes.filter((s) => s[key] != null).length > schemes.length / 2);
  const anyData = desc.filter((key) => schemes.some((s) => s[key] != null));
  if (!anyData.length) return null;
  const picked = [...new Set([...majority, ...anyData])].slice(0, count);
  return picked.sort((a, b) => SIF_COL_PERIODS_ASC.indexOf(a) - SIF_COL_PERIODS_ASC.indexOf(b));
}

function backtestSifLink(s) {
  try {
    const state = { v: 1, h: [{ k: 'sif', i: s.scheme_id, n: s.nav_name, c: sifStratShort(s.category), m: 'sip', mo: 10000, l: 100000, sm: 'default', cs: '' }], sd: 1, smo: 'lookback', lb: '3', sdt: '', su: 0, st: 0, bo: 0, b: null };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `/backtest?p=${b64}`;
  } catch (e) { return '/backtest'; }
}

/* ---------- stress test helpers ---------- */
function formatMonth(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function getLiquidityColor(days) {
  if (days <= 5) return '#2e7d32'; // Green
  if (days <= 10) return '#4caf50'; // Light Green
  if (days <= 15) return '#ff9800'; // Orange
  return '#d32f2f'; // Red
}

/* ---------- helpers ---------- */
const pctTxt = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');
const numTxt = (v, d = 1) => (v == null ? '—' : v.toFixed(d));
const cls = (v) => (v == null ? 'scr-muted' : v >= 0 ? 'scr-pos' : 'scr-neg');

function assetClass(cat = '') {
  if (/equity/i.test(cat)) return 'Equity';
  if (/hybrid|arbitrage|balanced|multi asset/i.test(cat)) return 'Hybrid';
  if (/index|etf|fof|fund of fund/i.test(cat)) return 'Index / FoF';
  if (/debt|income|liquid|gilt|bond|overnight|duration|money market|psu|credit|floater/i.test(cat)) return 'Debt';
  return 'Other';
}

// mirror of the Backtester ?p= encoder so a fund opens pre-loaded there
function backtestLink(f) {
  try {
    const state = { v: 1, h: [{ k: 'mf', i: f.code, n: f.name, c: f.category, m: 'sip', mo: 10000, l: 100000, sm: 'default', cs: '' }], sd: 1, smo: 'lookback', lb: '10', sdt: '', su: 0, st: 1, bo: 0, b: null };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `/backtest?p=${b64}`;
  } catch (e) { return '/backtest'; }
}

// All metric columns. kind controls formatting: ret/abs = % return, risk = vol%,
// dd = drawdown%, ratio = number. Sub-year periods (1M/3M/6M) are absolute, not annualised.
const METRICS = [
  { key: 'nav', label: 'NAV', kind: 'nav' },
  { key: 'ret_1m', label: '1M', kind: 'abs' },
  { key: 'ret_3m', label: '3M', kind: 'abs' },
  { key: 'ret_6m', label: '6M', kind: 'abs' },
  { key: 'ret_1y', label: '1Y', kind: 'ret' },
  { key: 'ret_3y', label: '3Y', kind: 'ret' },
  { key: 'ret_5y', label: '5Y', kind: 'ret' },
  { key: 'ret_7y', label: '7Y', kind: 'ret' },
  { key: 'ret_10y', label: '10Y', kind: 'ret' },
  { key: 'vol', label: 'Vol', kind: 'risk' },
  { key: 'max_dd', label: 'Max DD', kind: 'dd' },
  { key: 'ret_per_risk', label: 'Ret/Risk', kind: 'ratio' },
  { key: 'ret_inception', label: 'Inception', kind: 'ret' },
];
const DEFAULT_COLS = ['ret_1y', 'ret_3y', 'ret_5y', 'max_dd', 'ret_per_risk'];
// Ascending-by-default columns for the SIF table's sort: text (A-Z) and
// "lower is better" risk metrics. Everything else (nav, all return metrics,
// ret/risk) defaults to descending -- matches MF's own setSortKey
// convention exactly, so clicking a return column for the first time shows
// best-first on both tables, not best-first on MF and worst-first on SIF.
const SIF_ASC_DEFAULT = new Set(['category', 'sif_name', 'vol', 'max_dd']);
const fmtCell = (m, v) => {
  if (v == null) return '—';
  if (m.kind === 'nav') return '₹' + v.toFixed(4);
  if (m.kind === 'ratio') return v.toFixed(2);
  if (m.kind === 'risk') return v.toFixed(1) + '%';
  if (m.kind === 'dd') return v.toFixed(1) + '%';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
};
const cellCls = (m, v) => {
  if (m.kind === 'nav') return '';
  if (m.kind === 'risk') return '';
  if (m.kind === 'dd') return 'scr-neg';
  if (m.kind === 'ratio') return '';
  return cls(v);
};

// Default category per asset class (so picking a type lands on a useful view).
const GROUP_DEFAULT_CAT = {
  Equity: /flexi cap/i,
  Hybrid: /multi asset/i,
  'Index / FoF': /index fund/i,
  Debt: /liquid fund/i,
  Other: /children/i,
};

// Featured categories for the "category leaders" band (top 3 by 3Y CAGR each).
const FEATURED = [
  { label: 'Large Cap', m: (c) => /equity/i.test(c) && /large cap/i.test(c) && !/mid/i.test(c) },
  { label: 'Mid Cap', m: (c) => /mid cap/i.test(c) && !/large/i.test(c) },
  { label: 'Small Cap', m: (c) => /small cap/i.test(c) },
  { label: 'Flexi Cap', m: (c) => /flexi cap/i.test(c) },
  { label: 'ELSS (Tax Saver)', m: (c) => /elss/i.test(c) },
  { label: 'Multi Asset Allocation', m: (c) => /multi asset allocation/i.test(c) },
];

export default function ScreenerClient({ initialCategory }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(initialCategory ? assetClass(initialCategory) : 'Equity');
  const [cat, setCat] = useState(initialCategory || 'Equity Scheme - Flexi Cap Fund');
  const [openOnly, setOpenOnly] = useState(true);
  const [sort, setSort] = useState({ key: 'ret_3y', dir: -1 });
  const [sel, setSel] = useState(null);
  const [faq, setFaq] = useState(0);
  const [glossaryOpen, setGlossaryOpen] = useState(-1);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const [cols, setCols] = useState(DEFAULT_COLS);
  // SIF's own column selection, independent of MF's -- unlike MF's fixed
  // 1Y/3Y/5Y default (always meaningful, since MFs are long-established),
  // SIFs are a brand-new category where 1Y/3Y/5Y are still entirely blank
  // for every fund today. This placeholder gets replaced by
  // pickDefaultSifReturnCols once real data has loaded (see the
  // sifSortInitialized effect below) -- kept as the same static fallback
  // MF uses so there's a sensible starting point before that happens.
  const [sifCols, setSifCols] = useState(DEFAULT_COLS);

  // On wide desktop viewports, default to showing every column (all time
  // frames incl. Inception, not just the curated 5) since there's room for
  // more data at a glance. Runs once on mount, client-side only (avoids an
  // SSR/hydration mismatch from reading window.innerWidth during render);
  // no resize listener, so it never overrides a user's own column picks
  // made after the page loads. Applies to both tables -- SIF benefits from
  // "there's room, show everything" the same way MF does; the smart
  // per-availability default below only kicks in on narrower viewports.
  useEffect(() => {
    if (window.innerWidth >= 1024) {
      setCols(METRICS.map((m) => m.key));
      setSifCols(METRICS.map((m) => m.key));
    }
  }, []);

  // ── Compare helpers ────────────────────────────────────────────────────
  // compareList holds up to 3 entries, each { type: 'mf'|'sif', ...rawFund },
  // and persists across the MF/SIF tab switch (it's not reset by `group`).
  const MAX_COMPARE = 3;
  const [compareList, setCompareList] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  // Every entry stores its own `.id` up front (same 'mf-'+code / 'sif-'+
  // scheme_id format normalizeFund uses later) so nothing downstream needs
  // to recompute the id pattern — MFCompareBar's chip removal, in
  // particular, just reads `f.id` directly (see Task 7).
  const toggleCompare = useCallback((fund, type) => {
    const id = type === 'mf' ? 'mf-' + fund.code : 'sif-' + fund.scheme_id;
    setCompareList((prev) => {
      const already = prev.find((f) => f.id === id);
      if (already) return prev.filter((f) => f.id !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      // Spread `fund` FIRST, then override `id`/`type` -- defensive
      // ordering so a raw fund object's own fields can never clobber the
      // intended 'mf'/'sif' tag. (Raw SIF rows used to carry their own
      // `.type` strategy-string field via /api/sif-nav's shape, which is
      // exactly what this guarded against; the current /api/sif-screener
      // shape no longer has one, but the defensive order costs nothing
      // and protects against any future field collision too.)
      return [...prev, { ...fund, id, type }];
    });
  }, []);
  const isComparing = useCallback((type, key) => {
    const id = type === 'mf' ? 'mf-' + key : 'sif-' + key;
    return compareList.some((f) => f.id === id);
  }, [compareList]);
  const removeFromCompare = useCallback((id) => {
    setCompareList((prev) => prev.filter((f) => f.id !== id));
  }, []);
  const clearCompare = useCallback(() => setCompareList([]), []);

  // SIF state
  const [sifData, setSifData] = useState(null);
  const [sifLoading, setSifLoading] = useState(false);
  const [sifQ, setSifQ] = useState('');
  const [sifFamily, setSifFamily] = useState('all');
  const [sifCat, setSifCat] = useState('all');
  const [sifHouse, setSifHouse] = useState('all');
  const [sifSel, setSifSel] = useState(null);
  const [sifSort, setSifSort] = useState({ key: 'nav', dir: -1 });
  const [sifPage, setSifPage] = useState(0);

  // Stress test state
  const [stressMap, setStressMap] = useState({});

  const isSIF = group === 'SIF';

  useEffect(() => {
    fetch('/api/screener')
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setData(d); })
      .catch(() => setErr('Could not load screener data.'));

    fetch('/api/stress-test')
      .then((r) => r.json())
      .then((d) => { if (d?.data) setStressMap(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isSIF && !sifData && !sifLoading) {
      setSifLoading(true);
      fetch('/api/sif-screener')
        .then((r) => r.json())
        .then((d) => { if (d.error) setErr(d.error); else setSifData(d); })
        .catch(() => setErr('Could not load SIF data.'))
        .finally(() => setSifLoading(false));
    }
  }, [isSIF, sifData, sifLoading]);

  const funds = data?.funds || [];
  const groups = ['All', 'Equity', 'Hybrid', 'Debt', 'Index / FoF', 'Other', 'SIF'];

  /* ---- SIF derived state ---- */
  // IDCW/payout/reinvest/bonus/segregated variants are already excluded
  // server-side by scripts/build-sif-screener.mjs (same regex MF's own
  // build script applies) -- no client-side filtering needed.
  const sifSchemes = sifData?.schemes || [];
  // Default sort shouldn't be NAV -- once real data has loaded, switch it
  // once to the longest period most SIFs actually have (see
  // pickDefaultSortPeriod), so it naturally shifts from 1M today toward 3Y
  // as SIFs age, with no future code change needed. Same pass also picks
  // SIF's default COLUMNS (pickDefaultSifReturnCols) on narrower viewports
  // only -- on wide desktop the mount-time effect above already set
  // sifCols to show everything, and this must not narrow that back down
  // once data arrives. Runs only once (guarded by sifSortInitialized) so
  // it never overrides a user's own later sort/column clicks, even if
  // sifSchemes changes again (e.g. after the next nightly rebuild). Falls
  // back to leaving the initial NAV/static defaults in place if no period
  // has a majority (or any data) yet.
  const [sifSortInitialized, setSifSortInitialized] = useState(false);
  useEffect(() => {
    if (!sifSortInitialized && sifSchemes.length > 0) {
      const period = pickDefaultSortPeriod(sifSchemes);
      if (period) setSifSort({ key: period.key, dir: -1 });
      if (window.innerWidth < 1024) {
        const retCols = pickDefaultSifReturnCols(sifSchemes, 3);
        if (retCols) setSifCols([...retCols, 'max_dd', 'ret_per_risk']);
      }
      setSifSortInitialized(true);
    }
  }, [sifSchemes, sifSortInitialized]);
  const sifHouses = useMemo(() => [...new Set(sifSchemes.map((s) => s.sif_name))].sort(), [sifSchemes]);
  const sifCats = useMemo(() => [...new Set(sifSchemes.map((s) => s.category))].sort(), [sifSchemes]);
  const sifRows = useMemo(() => {
    let r = sifSchemes;
    if (sifFamily !== 'all') r = r.filter((s) => (s.category?.startsWith('Equity') ? 'Equity' : 'Hybrid') === sifFamily);
    if (sifCat !== 'all') r = r.filter((s) => s.category === sifCat);
    if (sifHouse !== 'all') r = r.filter((s) => s.sif_name === sifHouse);
    if (sifQ.trim()) { const t = sifQ.toLowerCase().split(/\s+/); r = r.filter((s) => { const str = (s.nav_name + ' ' + s.sif_name).toLowerCase(); return t.every((w) => str.includes(w)); }); }
    const { key, dir } = sifSort;
    return [...r].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      return typeof av === 'string' ? av.localeCompare(bv) * dir : (av - bv) * dir;
    });
  }, [sifSchemes, sifFamily, sifCat, sifHouse, sifQ, sifSort]);
  const sifPageCount = Math.max(1, Math.ceil(sifRows.length / pageSize));
  const sifCur = Math.min(sifPage, sifPageCount - 1);
  const sifVisible = sifRows.slice(sifCur * pageSize, sifCur * pageSize + pageSize);
  const setSifSortKey = (key) => setSifSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: SIF_ASC_DEFAULT.has(key) ? 1 : -1 }));
  useEffect(() => { setSifPage(0); }, [sifFamily, sifCat, sifHouse, sifQ, sifSort, pageSize]);
  const sifLeaders = useMemo(() => {
    const uniq = [...new Set(sifSchemes.map((s) => s.category))];
    return uniq.map((c) => {
      const inCat = sifSchemes.filter((s) => s.category === c);
      const period = pickCategoryLeaderPeriod(inCat);
      const top = period
        ? [...inCat].filter((s) => s[period.key] != null).sort((a, b) => b[period.key] - a[period.key]).slice(0, 3)
        : [...inCat].sort((a, b) => b.nav - a.nav).slice(0, 3); // no period has >=2 yet -- fall back to NAV, same as today
      return { label: sifStratShort(c), cat: c, top, period };
    }).filter((c) => c.top.length > 0);
  }, [sifSchemes]);
  const cats = useMemo(() => {
    const map = new Map();
    funds.forEach((f) => {
      if (group === 'All' || assetClass(f.category) === group) {
        const norm = normalizeCategory(f.category);
        if (!map.has(norm)) {
          map.set(norm, { cat: f.category, count: 0 });
        }
        map.get(norm).count += 1;
      }
    });
    return [...map.values()].sort((a, b) => b.count - a.count).map((item) => [item.cat, item.count]);
  }, [funds, group]);

  const rows = useMemo(() => {
    let r = funds;
    if (openOnly) r = r.filter((f) => /open/i.test(f.structure || ''));
    if (group !== 'All') r = r.filter((f) => assetClass(f.category) === group);
    if (cat !== 'All') r = r.filter((f) => matchCategory(f.category, cat));
    if (q.trim()) { const t = q.toLowerCase().split(/\s+/); r = r.filter((f) => { const s = (f.name + ' ' + f.amc).toLowerCase(); return t.every((w) => s.includes(w)); }); }
    const { key, dir } = sort;
    r = [...r].sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      return (av - bv) * dir;
    });
    return r;
  }, [funds, openOnly, group, cat, q, sort]);

  const setSortKey = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'vol' || key === 'max_dd' ? 1 : -1 }));

  const leaders = useMemo(() => {
    const pool = funds.filter((f) => /open/i.test(f.structure || '') && f.flag !== 'check' && f.ret_3y != null);
    let featured; // [{ label, m }]
    if (group === 'All') {
      featured = FEATURED; // curated cross-asset set
    } else {
      // top categories WITHIN the selected type, ranked by number of funds
      const counts = {};
      pool.forEach((f) => { if (assetClass(f.category) === group) counts[f.category] = (counts[f.category] || 0) + 1; });
      featured = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([c]) => ({ label: shortCat(c), m: (x) => x === c }));
    }
    return featured.map((cat) => ({
      label: cat.label,
      top: pool.filter((f) => cat.m(f.category || '')).sort((a, b) => b.ret_3y - a.ret_3y).slice(0, 3),
    })).filter((c) => c.top.length > 0);
  }, [funds, group]);

  const router = useRouter();
  const changeCat = useCallback((newCat) => {
    if (!newCat) return;
    setCat(newCat);
    const grp = assetClass(newCat);
    if (grp && grp !== 'Other') setGroup(grp);
    const slug = categoryToSlug(newCat);
    if (slug) {
      router.replace(`/screener?category=${slug}`, { scroll: false });
    }
  }, [router]);
  const jumpTo = (f) => {
    const targetCat = typeof f === 'string' ? f : f?.category;
    if (targetCat) {
      changeCat(targetCat);
      setSort({ key: 'ret_3y', dir: -1 });
    }
  };

  // pick a sensible default category when a type is chosen
  const defaultCatFor = (g) => {
    if (g === 'All') return 'All';
    const re = GROUP_DEFAULT_CAT[g];
    const hit = re && funds.find((f) => assetClass(f.category) === g && re.test(f.category || ''));
    return hit ? hit.category : 'All';
  };
  const pickGroup = (g) => { setGroup(g); if (g !== 'SIF') changeCat(defaultCatFor(g)); setQ(''); setSifQ(''); };
  // MF and SIF now keep independent column selections (see sifCols above),
  // since their sensible defaults genuinely differ -- activeCols/toggleCol
  // resolve to whichever table is currently showing, so the rest of the
  // render code (visibleCols, the Columns bar) doesn't need to know which.
  const activeCols = isSIF ? sifCols : cols;
  const setActiveCols = isSIF ? setSifCols : setCols;
  const visibleCols = METRICS.filter((m) => activeCols.includes(m.key));
  const toggleCol = (key) => setActiveCols((c) => (c.includes(key) ? (c.length > 1 ? c.filter((k) => k !== key) : c) : [...c, key]));

  // pagination
  useEffect(() => { setPage(0); }, [group, cat, q, openOnly, sort, pageSize]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pageCount - 1);
  const visible = rows.slice(cur * pageSize, cur * pageSize + pageSize);
  const from = rows.length ? cur * pageSize + 1 : 0;
  const to = Math.min(rows.length, (cur + 1) * pageSize);

  const curatedCat = !isSIF ? CURATED_CATEGORIES.find((c) => c.category === cat) : null;

  return (
    <div className="scr-body">
      <Navbar activePage="screener" />
      <div className="container">
        <div className="page-header">
          <div className="page-eyebrow"><span className="live-dot" /><span className="page-eyebrow-text">Live · rebuilt daily from AMFI NAVs</span></div>
          <h1 className="page-title">{isSIF ? <><span>SIF</span> Screener</> : 'Mutual Fund Screener'}</h1>
          <p className="page-subtitle">
            {isSIF
              ? <>Discover all SEBI-regulated <b>Specialised Investment Funds</b> — {sifData ? sifSchemes.length : '…'} schemes across Equity Long-Short, Hybrid Long-Short and Active Asset Allocator strategies.</>
              : <>Filter and rank {data ? data.count.toLocaleString('en-IN') : '1,800+'} mutual funds by category, returns and risk — on real historical NAVs.{curatedCat?.subtitleSuffix}</>
            }
          </p>
        </div>

        {/* controls */}
        <div className="scr-controls">
          <input className="scr-search" placeholder={isSIF ? 'Search SIF or fund house…' : 'Search fund or AMC…'}
            value={isSIF ? sifQ : q} onChange={(e) => isSIF ? setSifQ(e.target.value) : setQ(e.target.value)} />
          <div className="scr-groups">
            {groups.map((g) => (
              <button key={g} className={`scr-chip ${group === g ? 'on' : ''} ${g === 'SIF' ? 'scr-chip-sif' : ''}`} onClick={() => pickGroup(g)}>{g}</button>
            ))}
          </div>
          {!isSIF && (
            <select className="scr-select" value={cat} onChange={(e) => changeCat(e.target.value)}>
              <option value="All">All categories</option>
              {cats.map(([c, n]) => <option key={c} value={c}>{shortCat(c)} ({n})</option>)}
            </select>
          )}
          {isSIF && (
            <>
              <select className="scr-select" value={sifFamily} onChange={(e) => setSifFamily(e.target.value)}>
                <option value="all">All strategies</option>
                <option value="Equity">Equity strategies</option>
                <option value="Hybrid">Hybrid strategies</option>
              </select>
              <select className="scr-select" value={sifCat} onChange={(e) => setSifCat(e.target.value)}>
                <option value="all">All categories</option>
                {sifCats.map((c) => <option key={c} value={c}>{sifStratShort(c)}</option>)}
              </select>
              <select className="scr-select" value={sifHouse} onChange={(e) => setSifHouse(e.target.value)}>
                <option value="all">All fund houses</option>
                {sifHouses.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </>
          )}
          {!isSIF && <label className="scr-toggle"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /><span>Open-ended only</span></label>}
        </div>

        <div className="scr-colbar">
          <span className="scr-colbar-l">Columns:</span>
          {METRICS.map((m) => (
            <button key={m.key} className={`scr-colchip ${activeCols.includes(m.key) ? 'on' : ''}`} onClick={() => toggleCol(m.key)}>{m.label}</button>
          ))}
        </div>

        <div className="scr-meta">
          {err ? <span className="scr-neg">{err}</span> : isSIF
            ? <>Showing <b>{sifRows.length}</b> SIF scheme{sifRows.length !== 1 ? 's' : ''}{sifData ? <> · NAV as of {sifData.asof}</> : ''}. Tap a fund for detail.</>
            : <>Showing <b>{rows.length.toLocaleString('en-IN')}</b> funds{data ? <> · as of {data.asof}</> : ''}. Tap a fund for detail.</>
          }
        </div>

        {/* SIF leaders */}
        {isSIF && sifLeaders.length > 0 && (
          <section className="scr-leaders" aria-label="SIF strategy overview">
            <div className="scr-leaders-h">SIF strategies <em>· top 3 by best available return per category</em></div>
            <div className="scr-leaders-grid">
              {sifLeaders.map((c) => (
                <div className="scr-lead-card" key={c.label}>
                  <button className="scr-lead-cat" onClick={() => { setSifCat(c.cat); setSifFamily('all'); }}>
                    {c.label} <span className="scr-lead-all">view all →</span>
                  </button>
                  {c.top.map((s, i) => (
                    <button className="scr-lead-row" key={s.scheme_id} onClick={() => setSifSel(s)}>
                      <span className="scr-lead-rank">{i + 1}</span>
                      <span className="scr-lead-name">{s.sif_name}</span>
                      {c.period ? (
                        <span className="scr-lead-ret scr-pos">{s[c.period.key] > 0 ? '+' : ''}{s[c.period.key].toFixed(1)}% ({c.period.label})</span>
                      ) : (
                        <span className="scr-lead-ret scr-muted">₹{s.nav.toFixed(2)}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MF leaders */}
        {!isSIF && leaders.length > 0 && (
          <section className="scr-leaders" aria-label="Category leaders">
            <div className="scr-leaders-h">Category leaders {group !== 'All' && <b className="scr-leaders-g">{group}</b>} <em>· top 3 by 3-year return</em></div>
            <div className="scr-leaders-grid">
              {leaders.map((c) => (
                <div className="scr-lead-card" key={c.label}>
                  <button className="scr-lead-cat" onClick={() => jumpTo(c.top[0])}>{c.label} <span className="scr-lead-all">view all →</span></button>
                  {c.top.map((f, i) => (
                    <button className="scr-lead-row" key={f.code} onClick={() => setSel(f)}>
                      <span className="scr-lead-rank">{i + 1}</span>
                      <span className="scr-lead-name">{f.name.replace(/\s*-\s*(Regular Plan|Regular|Growth( Option)?| Plan).*/i, '').trim()}</span>
                      <span className="scr-lead-ret scr-pos">{f.ret_3y > 0 ? '+' : ''}{f.ret_3y.toFixed(1)}%</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SIF table */}
        {isSIF && (
          <>
            <div className="scr-table-wrap">
              <table className="scr-table">
                <thead>
                  <tr>
                    <th style={{ width: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '.65rem' }} title="Add to compare (max 3)">⚖</th>
                    <th className="scr-name-h">Fund</th>
                    <th className={`scr-sortable ${sifSort.key === 'category' ? 'active' : ''}`} style={{textAlign:'left'}} onClick={() => setSifSortKey('category')}>Strategy{sifSort.key === 'category' ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}</th>
                    <th className={`scr-sortable ${sifSort.key === 'sif_name' ? 'active' : ''}`} style={{textAlign:'left'}} onClick={() => setSifSortKey('sif_name')}>Fund House{sifSort.key === 'sif_name' ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}</th>
                    {visibleCols.map((m) => (
                      <th key={m.key} className={`scr-sortable ${sifSort.key === m.key ? 'active' : ''}`} onClick={() => setSifSortKey(m.key)}>
                        {m.label}{sifSort.key === m.key ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sifVisible.map((s) => {
                    const fam = s.category?.startsWith('Equity') ? 'Equity' : 'Hybrid';
                    return (
                      <tr key={s.scheme_id} className={`scr-row${isComparing('sif', s.scheme_id) ? ' row-comparing' : ''}`} onClick={() => setSifSel(s)}>
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', paddingLeft: 8, paddingRight: 4 }}>
                          <input
                            type="checkbox"
                            className="cmp-chk"
                            checked={isComparing('sif', s.scheme_id)}
                            onChange={() => toggleCompare(s, 'sif')}
                            disabled={!isComparing('sif', s.scheme_id) && compareList.length >= MAX_COMPARE}
                            title={isComparing('sif', s.scheme_id) ? 'Remove from compare' : compareList.length >= MAX_COMPARE ? 'Max 3 selected' : 'Add to compare'}
                            aria-label={`Compare ${s.nav_name}`}
                          />
                        </td>
                        <td className="scr-name">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ProviderAvatar
                              name={s.sif_name}
                              logoPath={getSIFLogo(s.sif_name)}
                              size={26}
                              radius={6}
                            />
                            <button className="scr-fundlink" onClick={(e) => { e.stopPropagation(); setSifSel(s); }}>
                              <span className="scr-fund-n">{s.nav_name.replace(/\s*-\s*(Regular Plan|Regular).*/i, '').trim()}</span>
                              <span className="scr-fund-sub">{s.scheme_id}</span>
                            </button>
                          </div>
                        </td>
                        <td style={{textAlign:'left'}}>
                          <span className={`scr-sif-badge scr-sif-badge-${fam.toLowerCase()}`}>{sifStratShort(s.category)}</span>
                        </td>
                        <td style={{textAlign:'left',color:'var(--text2)',fontSize:'12px',fontWeight:600}}>{s.sif_name}</td>
                        {visibleCols.map((m) => (
                          <td key={m.key} className={cellCls(m, s[m.key])}>{m.kind === 'ratio' ? <b>{fmtCell(m, s[m.key])}</b> : fmtCell(m, s[m.key])}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sifLoading && <div className="scr-loading">Loading SIF data…</div>}
            {!sifLoading && sifData && sifRows.length === 0 && <div className="scr-loading">No SIFs match these filters.</div>}
            {sifRows.length > 0 && (
              <div className="scr-pager">
                <div className="scr-pager-info">Showing <b>{sifCur * pageSize + 1}–{Math.min(sifRows.length, (sifCur + 1) * pageSize)}</b> of {sifRows.length}</div>
                <div className="scr-pager-ctrls">
                  <button className="scr-pg-btn" disabled={sifCur === 0} onClick={() => setSifPage(sifCur - 1)}>‹ Prev</button>
                  <span className="scr-pg-now">Page {sifCur + 1} / {sifPageCount}</span>
                  <button className="scr-pg-btn" disabled={sifCur >= sifPageCount - 1} onClick={() => setSifPage(sifCur + 1)}>Next ›</button>
                </div>
                <label className="scr-pager-size">Show
                  <select value={pageSize} onChange={(e) => setPageSize(+e.target.value)}>
                    <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100000}>All</option>
                  </select>
                  per page
                </label>
              </div>
            )}
          </>
        )}

        {/* MF table */}
        {!isSIF && (
          <>
            <div className="scr-table-wrap">
              <table className="scr-table">
                <thead>
                  <tr>
                    <th style={{ width: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '.65rem' }} title="Add to compare (max 3)">⚖</th>
                    <th className="scr-name-h">Fund</th>
                    {visibleCols.map((m) => (
                      <th key={m.key} className={`scr-sortable ${sort.key === m.key ? 'active' : ''}`} onClick={() => setSortKey(m.key)}>
                        {m.label}{sort.key === m.key ? <span className="scr-arrow">{sort.dir < 0 ? '▾' : '▴'}</span> : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((f) => {
                    const hasStress = stressMap[f.code];
                    let badgeCls = '';
                    if (hasStress) {
                      const d = hasStress.days_50pct;
                      if (d >= 15) badgeCls = 'scr-table-liq-red';
                      else if (d >= 7) badgeCls = 'scr-table-liq-amber';
                      else badgeCls = 'scr-table-liq-green';
                    }
                    return (
                      <tr key={f.code} className={`scr-row${isComparing('mf', f.code) ? ' row-comparing' : ''}`} onClick={() => setSel(f)}>
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', paddingLeft: 8, paddingRight: 4 }}>
                          <input
                            type="checkbox"
                            className="cmp-chk"
                            checked={isComparing('mf', f.code)}
                            onChange={() => toggleCompare(f, 'mf')}
                            disabled={!isComparing('mf', f.code) && compareList.length >= MAX_COMPARE}
                            title={isComparing('mf', f.code) ? 'Remove from compare' : compareList.length >= MAX_COMPARE ? 'Max 3 selected' : 'Add to compare'}
                            aria-label={`Compare ${f.name}`}
                          />
                        </td>
                        <td className="scr-name">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ProviderAvatar
                              name={f.amc}
                              logoPath={getMFLogo(f.amc)}
                              size={26}
                              radius={6}
                            />
                            <button className="scr-fundlink" onClick={(e) => { e.stopPropagation(); setSel(f); }}>
                              <span className="scr-fund-n">{f.name.replace(/\s*-\s*(Regular Plan|Regular|Growth( Option)?| Plan).*/i, '').trim()}{f.flag === 'check' && <span className="scr-flag" title="Unusual value — under review">⚠</span>}</span>
                              <span className="scr-fund-sub">
                                {shortCat(f.category)}
                                {hasStress && (
                                  <span className={`scr-table-liq-badge ${badgeCls}`} title={`Liquidity disclosure: Takes ${hasStress.days_50pct} days to liquidate 50% under stress`}>
                                    💧 {hasStress.days_50pct}d
                                  </span>
                                )}
                              </span>
                            </button>
                          </div>
                        </td>
                        {visibleCols.map((m) => (
                          <td key={m.key} className={cellCls(m, f[m.key])}>{m.kind === 'ratio' ? <b>{fmtCell(m, f[m.key])}</b> : fmtCell(m, f[m.key])}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!data && !err && <div className="scr-loading">Loading funds…</div>}
            {data && rows.length === 0 && <div className="scr-loading">No funds match these filters.</div>}
            {rows.length > 0 && (
              <div className="scr-pager">
                <div className="scr-pager-info">Showing <b>{from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')}</b> of {rows.length.toLocaleString('en-IN')}</div>
                <div className="scr-pager-ctrls">
                  <button className="scr-pg-btn" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹ Prev</button>
                  <span className="scr-pg-now">Page {cur + 1} / {pageCount}</span>
                  <button className="scr-pg-btn" disabled={cur >= pageCount - 1} onClick={() => setPage(cur + 1)}>Next ›</button>
                </div>
                <label className="scr-pager-size">Show
                  <select value={pageSize} onChange={(e) => setPageSize(+e.target.value)}>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={100000}>All</option>
                  </select>
                  per page
                </label>
              </div>
            )}
          </>
        )}

        {curatedCat && (
          <div className="scr-explainer">
            <b>{curatedCat.label} funds.</b> {curatedCat.explainer}
          </div>
        )}

        {/* Glossary */}
        <section className="scr-faq" aria-label="Glossary">
          <h2>Glossary</h2>
          {GLOSSARY_ITEMS.map((g, i) => (
            <div className={`scr-faq-item ${glossaryOpen === i ? 'open' : ''}`} key={i}>
              <button className="scr-faq-q" onClick={() => setGlossaryOpen(glossaryOpen === i ? -1 : i)} aria-expanded={glossaryOpen === i}><span>{g.q}</span><span className="scr-faq-ic">{glossaryOpen === i ? '−' : '+'}</span></button>
              <div className="scr-faq-a" style={{ maxHeight: glossaryOpen === i ? 2000 : 0 }}><p>{g.a}</p></div>
            </div>
          ))}
        </section>

        {/* FAQ */}
        <section className="scr-faq" aria-label="FAQ">
          <h2>Frequently asked questions</h2>
          {FAQ_ITEMS.map((f, i) => (
            <Fragment key={i}>
              {(i === 0 || FAQ_ITEMS[i - 1].group !== f.group) && <div className="scr-faq-group-h">{f.group}</div>}
              <div className={`scr-faq-item ${faq === i ? 'open' : ''}`}>
                <button className="scr-faq-q" onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i}><span>{f.q}</span><span className="scr-faq-ic">{faq === i ? '−' : '+'}</span></button>
                <div className="scr-faq-a" style={{ maxHeight: faq === i ? 2000 : 0 }}><p>{f.a}</p></div>
              </div>
            </Fragment>
          ))}
        </section>

        <div className="scr-disc">
          <b>Disclaimer.</b> Educational tool by <b>Atin Kumar Agrawal | Abundance Financial Services</b> · AMFI Registered Mutual Funds &amp; SIF Distributor (ARN-251838). Returns are point-to-point CAGR from AMFI NAVs; volatility and drawdown are month-end approximations. Mutual fund investments are subject to market risks; read all scheme-related documents carefully. Past performance is not indicative of future results. This is not investment advice.
        </div>
      </div>

      <MFCompareBar
        selected={compareList}
        onRemove={removeFromCompare}
        onClear={clearCompare}
        onCompare={() => setShowCompare(true)}
      />

      {showCompare && (
        <MFCompareModal
          funds={compareList}
          allMfFunds={funds}
          onClose={() => setShowCompare(false)}
          onRemove={removeFromCompare}
        />
      )}

      <Footer activePage="screener" />

      {sel && <Detail f={sel} stress={stressMap[sel.code]} onClose={() => setSel(null)} />}
      {sifSel && <SifDetail s={sifSel} onClose={() => setSifSel(null)} />}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

/* ---------- fund detail drawer (fetches NAV sparkline on open) ---------- */
function Detail({ f, stress, onClose }) {
  const [nav, setNav] = useState(null);
  const [schemeFacts, setSchemeFacts] = useState(null);
  const [holdingsData, setHoldingsData] = useState(null);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getSchemeMasterFacts().then(facts => { if (alive) setSchemeFacts(facts); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setHoldingsLoading(true);
    setHoldingsData(null);
    fetch(`/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(f.code)}&schemeName=${encodeURIComponent(f.name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setHoldingsData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setHoldingsLoading(false); });
    return () => { alive = false; };
  }, [f.code, f.name]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    let alive = true;
    fetch(`/api/mf?code=${f.code}`).then((r) => r.json()).then((d) => {
      if (!alive || !d?.data?.length) return;
      const pts = d.data.map((x) => { const [dd, mm, yy] = x.date.split('-'); return { t: Date.UTC(+yy, +mm - 1, +dd), v: +x.nav }; }).filter((p) => isFinite(p.v)).sort((a, b) => a.t - b.t);
      setNav(pts);
    }).catch(() => {});
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [f, onClose]);

  const M = [['1Y', f.ret_1y, '%'], ['3Y', f.ret_3y, '%'], ['5Y', f.ret_5y, '%'], ['Since inception', f.ret_inception, '%'], ['Volatility', f.vol, '%'], ['Max drawdown', f.max_dd, '%'], ['Return / risk', f.ret_per_risk, '']];
  return (
    <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="scr-drawer-h">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
            <ProviderAvatar
              name={f.amc}
              logoPath={getMFLogo(f.amc)}
              size={36}
              radius={8}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="scr-drawer-name">{f.name}</div>
              <div className="scr-drawer-tags"><span className="scr-tag">{f.amc}</span><span className="scr-tag alt">{shortCat(f.category)}</span><span className="scr-tag alt">{f.structure}</span></div>
            </div>
          </div>
          <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {f.flag === 'check' && <div className="scr-warn">⚠ One or more returns look unusual for this fund — we’re reviewing the source NAV. Treat with caution.</div>}
        {stress && stress.days_50pct > 20 && (
          <div className="scr-warn" style={{ backgroundColor: 'rgba(211, 47, 47, 0.08)', border: '1px solid rgba(211, 47, 47, 0.2)', color: '#d32f2f' }}>
            ⚠️ <b>Liquidity Alert:</b> This fund takes <b>{stress.days_50pct} days</b> to liquidate 50% of its portfolio under stress. High redemption volume could significantly impact portfolio values.
          </div>
        )}

        {!nav ? (
          <div className="scr-spark-load">Loading NAV history…</div>
        ) : nav.length < 2 ? null : (
          <CompareGrowthChart
            series={[{ name: f.name, color: nav[nav.length - 1].v >= nav[0].v ? '#2e7d32' : '#b71c1c', data: nav }]}
            showLegend={false}
          />
        )}

        <div className="scr-drawer-kpis">
          {M.map(([l, v, u]) => (
            <div className="scr-dk" key={l}><span>{l}</span><b className={u === '%' && (l.includes('draw')) ? 'scr-neg' : cls(typeof v === 'number' ? v : null)}>{v == null ? '—' : (u === '%' ? (v > 0 && !l.includes('draw') && !l.includes('Vol') ? '+' : '') + v.toFixed(1) + '%' : v.toFixed(2))}</b></div>
          ))}
        </div>

        {stress && (
          <div className="scr-stress-section">
            <div className="scr-stress-title">💧 Liquidity &amp; Stress Test Analysis</div>
            <div className="scr-stress-month">Data as of {formatMonth(stress.month)}</div>
            
            <div className="scr-stress-liquidity-grid">
              <div className="scr-stress-liq-card">
                <div className="scr-liq-label">Days to Liquidate 50%</div>
                <div className="scr-liq-val">{stress.days_50pct} days</div>
                <div className="scr-liq-meter">
                  <div className="scr-liq-meter-fill" style={{ width: `${Math.min(100, (stress.days_50pct / 30) * 100)}%`, backgroundColor: getLiquidityColor(stress.days_50pct) }}></div>
                </div>
              </div>
              <div className="scr-stress-liq-card">
                <div className="scr-liq-label">Days to Liquidate 25%</div>
                <div className="scr-liq-val">{stress.days_25pct} days</div>
                <div className="scr-liq-meter">
                  <div className="scr-liq-meter-fill" style={{ width: `${Math.min(100, (stress.days_25pct / 15) * 100)}%`, backgroundColor: getLiquidityColor(stress.days_25pct * 2) }}></div>
                </div>
              </div>
            </div>

            {stress.days_50pct >= 15 && stress.days_50pct <= 20 && (
              <div className="scr-warn-liquidity">
                ⚠️ <b>Moderate Liquidity Risk:</b> Takes {stress.days_50pct} days to liquidate half of the portfolio under stress conditions.
              </div>
            )}

            <div className="scr-stress-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
              <div className="scr-dk">
                <span>Top 10 Investors</span>
                <b>{stress.top10_investors_pct ? `${stress.top10_investors_pct}%` : '—'}</b>
              </div>
              <div className="scr-dk">
                <span>Turnover Ratio</span>
                <b>{stress.turnover_ratio ? `${stress.turnover_ratio}%` : '—'}</b>
              </div>
              <div className="scr-dk">
                <span>Portfolio Beta</span>
                <b>{stress.beta ? stress.beta.toFixed(2) : '—'}</b>
              </div>
            </div>

            <div className="scr-allocation-card">
              <div className="scr-alloc-title">Asset Allocation Breakdown</div>
              <div className="scr-alloc-bars">
                <div className="scr-alloc-item">
                  <div className="scr-alloc-lbl">Large Cap ({stress.large_cap_pct}%)</div>
                  <div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill large-cap" style={{ width: `${stress.large_cap_pct}%` }}></div></div>
                </div>
                <div className="scr-alloc-item">
                  <div className="scr-alloc-lbl">Mid Cap ({stress.mid_cap_pct}%)</div>
                  <div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill mid-cap" style={{ width: `${stress.mid_cap_pct}%` }}></div></div>
                </div>
                <div className="scr-alloc-item">
                  <div className="scr-alloc-lbl">Small Cap ({stress.small_cap_pct}%)</div>
                  <div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill small-cap" style={{ width: `${stress.small_cap_pct}%` }}></div></div>
                </div>
                <div className="scr-alloc-item">
                  <div className="scr-alloc-lbl">Cash ({stress.cash_pct}%)</div>
                  <div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill cash" style={{ width: `${stress.cash_pct}%` }}></div></div>
                </div>
              </div>
            </div>

            <div className="scr-valuation-card">
              <div className="scr-alloc-title">PE Valuation vs Benchmark</div>
              <div className="scr-pe-grid">
                <div className="scr-pe-item">
                  <div className="scr-pe-label">Portfolio PE</div>
                  <div className="scr-pe-val">{stress.pe_portfolio ? stress.pe_portfolio.toFixed(1) : '—'}</div>
                </div>
                <div className="scr-pe-item">
                  <div className="scr-pe-label">Benchmark PE</div>
                  <div className="scr-pe-val">{stress.pe_benchmark ? stress.pe_benchmark.toFixed(1) : '—'}</div>
                </div>
              </div>
              {stress.pe_benchmark_1ya && (
                <div className="scr-pe-history">
                  Benchmark PE: 1Y ago <b>{stress.pe_benchmark_1ya.toFixed(1)}</b> {stress.pe_benchmark_2ya && <>| 2Y ago <b>{stress.pe_benchmark_2ya.toFixed(1)}</b></>}
                </div>
              )}
            </div>
          </div>
        )}

        <HoldingsSection holdingsData={holdingsData} loading={holdingsLoading} schemeName={f.name} />

        <div className="scr-drawer-meta">
          <span>Latest NAV ₹{f.nav}</span>
          {f.inception_date && <span>Since {new Date(f.inception_date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>}
          <span>Age ~{f.age_years ?? '—'} yrs</span>
          <span>as of {f.asof}</span>
        </div>

        {(() => {
          if (!schemeFacts) return null;
          const masterRec = (f.isin && schemeFacts.byIsin?.[f.isin]) ||
            (f.code && schemeFacts.byAmfiCode?.[f.code]) || (() => {
              const norm = normalizeSchemeName(f.name);
              return norm ? schemeFacts.byNormName?.[norm] : null;
            })();

          if (!masterRec) return null;

          return (
            <div style={{ margin: '14px 0', padding: '14px 16px', background: 'var(--s2)', borderRadius: '12px', border: '1.5px solid var(--border)' }}>
              <div style={{ fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '10px', fontFamily: "'JetBrains Mono', monospace" }}>
                📋 Key Operational Facts (BSE StAR)
              </div>
              {(masterRec.purchaseAllowed === false || masterRec.redemptionAllowed === false) && (
                <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#d32f2f', background: 'rgba(211,47,47,0.08)', border: '1px solid rgba(211,47,47,0.2)', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px' }}>
                  ⚠️ {masterRec.purchaseAllowed === false && masterRec.redemptionAllowed === false
                    ? 'Currently not accepting fresh purchases or redemptions via BSE'
                    : masterRec.purchaseAllowed === false
                    ? 'Currently not accepting fresh purchases via BSE'
                    : 'Currently not accepting redemptions via BSE'}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🕒 Daily NAV Cutoff</div>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>{masterRec.redeemCutoff || masterRec.purchaseCutoff || masterRec.cutoff || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🏦 Settlement Cycle</div>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>{masterRec.settlement ? `${masterRec.settlement} Business Days` : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>💰 Min Lumpsum</div>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>{masterRec.minPurchase != null ? `₹${masterRec.minPurchase.toLocaleString('en-IN')}` : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🏢 RTA Servicer</div>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: masterRec.rta === 'CAMS' ? '#1565c0' : masterRec.rta === 'KFINTECH' ? '#6a1b9a' : 'var(--text)' }}>{masterRec.rta || '—'}</div>
                </div>
              </div>
              {masterRec.exitLoadText && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🚪 Exit Load {masterRec.exitLoadConfidence === 'low' && '(needs review)'}</div>
                  {masterRec.exitLoadConfidence === 'high' && Array.isArray(masterRec.exitLoadTiers) ? (
                    <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>
                      {masterRec.exitLoadTiers.length === 0
                        ? '0% (No Load)'
                        : masterRec.exitLoadTiers.map((t) => `${(t.rate * 100).toFixed(2).replace(/\.00$/, '')}% (<${Math.round(t.days / 30.44)}mo)`).join(' / ')}
                      {masterRec.exitLoadFreePercent ? ` · ${masterRec.exitLoadFreePercent}% free` : ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)', fontStyle: 'italic' }}>{masterRec.exitLoadText}</div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {masterRec.swp === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>SWP Eligible</span>}
                {masterRec.sip === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>SIP Available</span>}
                {masterRec.switchAllowed === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>Switch Available</span>}
                {masterRec.divReinvest === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>IDCW Reinvestment</span>}
                <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--s3)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Demat &amp; SOA</span>
              </div>
            </div>
          );
        })()}

        <div className="scr-drawer-cta">
          <a className="scr-btn primary" href={`/fund/${f.code}`} target="_blank" rel="noreferrer">📄 Full Fund Report →</a>
          <a className="scr-btn" href={backtestLink(f)}>⚗ Backtest this fund</a>
          <a className="scr-btn" href="/rolling">📉 Rolling returns</a>
        </div>
      </div>
    </div>
  );
}
/* ---------- SIF detail drawer ---------- */
function SifDetail({ s, onClose }) {
  const [pts, setPts] = useState(null);
  const [histLoading, setHistLoading] = useState(true);
  const [holdingsData, setHoldingsData] = useState(null);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setHoldingsLoading(true);
    setHoldingsData(null);
    fetch(`/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(s.scheme_id)}&schemeName=${encodeURIComponent(s.nav_name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setHoldingsData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setHoldingsLoading(false); });
    return () => { alive = false; };
  }, [s.scheme_id, s.nav_name]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    let alive = true;
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    fetch(`/api/sif-history?sd_id=${encodeURIComponent(s.scheme_id)}&from=${from}&to=${today}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.records?.length) { setHistLoading(false); return; }
        setPts(d.records.map((r) => ({ t: new Date(r.date).getTime(), v: +r.nav })).filter((p) => isFinite(p.v)).sort((a, b) => a.t - b.t));
        setHistLoading(false);
      })
      .catch(() => setHistLoading(false));
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [s, onClose]);

  const fam = s.category?.startsWith('Equity') ? 'Equity' : 'Hybrid';
  return (
    <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="scr-drawer-h">
          <div>
            <div className="scr-drawer-name">{s.nav_name.replace(/\s*-\s*(Regular Plan|Regular).*/i, '').trim()}</div>
            <div className="scr-drawer-tags">
              <span className="scr-tag">{s.sif_name}</span>
              <span className={`scr-sif-badge scr-sif-badge-${fam.toLowerCase()}`} style={{fontSize:'10px',padding:'3px 8px'}}>{SIF_STRATEGY_LABELS[s.category] || sifStratShort(s.category)}</span>
              <span className="scr-tag alt">{s.scheme_id}</span>
            </div>
          </div>
          <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="scr-sif-notice">ⓘ SIFs are a new asset class (launched 2024–25) with limited NAV history — longer-horizon metrics (3Y+) will populate as funds mature. See the table for the return periods already available.</div>

        {histLoading ? (
          <div className="scr-spark-load">Loading NAV history…</div>
        ) : (!pts || pts.length < 2) ? (
          <div className="scr-spark-load">No NAV history available yet</div>
        ) : (
          <CompareGrowthChart
            series={[{ name: s.nav_name, color: pts[pts.length - 1].v >= pts[0].v ? '#2e7d32' : '#b71c1c', data: pts }]}
            showLegend={false}
          />
        )}

        <div className="scr-drawer-kpis">
          <div className="scr-dk"><span>Latest NAV</span><b>₹{s.nav.toFixed(4)}</b></div>
          <div className="scr-dk"><span>NAV Date</span><b style={{fontSize:'13px'}}>{s.nav_date}</b></div>
          <div className="scr-dk"><span>Data points</span><b>{pts ? pts.length : '—'}</b></div>
        </div>

        <HoldingsSection holdingsData={holdingsData} loading={holdingsLoading} schemeName={s.nav_name} />

        <div className="scr-drawer-cta">
          <a className="scr-btn primary" href={backtestSifLink(s)}>⚗ Backtest this SIF</a>
          <a className="scr-btn" href="/sifs">📋 Full SIF screener</a>
        </div>
      </div>
    </div>
  );
}


const CSS = `
.scr-body{font-family:Raleway,sans-serif;color:var(--text);padding-bottom:48px}
/* SIF chip styling */
.scr-chip-sif{border-color:#5e35b133;color:#7c4dff!important}
.scr-chip-sif:hover{border-color:#7c4dff!important}
.scr-chip-sif.on{background:linear-gradient(135deg,#5e35b1,#7c4dff)!important;color:#fff!important;border-color:#5e35b1!important}
/* SIF strategy badges */
.scr-sif-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:6px;font:700 11px JetBrains Mono,monospace;white-space:nowrap}
.scr-sif-badge-equity{background:rgba(27,94,32,.12);color:var(--g1)}
.scr-sif-badge-hybrid{background:rgba(94,53,177,.10);color:#5e35b1}
/* SIF notice */
.scr-sif-notice{background:rgba(94,53,177,.08);border:1px solid rgba(94,53,177,.2);border-radius:8px;padding:9px 12px;font-size:12px;color:#7c4dff;margin-bottom:14px}
.scr-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
.scr-search{flex:1;min-width:200px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;font:500 14px Raleway,sans-serif;background:var(--surface);color:var(--text)}
.scr-search:focus{outline:none;border-color:var(--g3);box-shadow:0 0 0 3px var(--g-xlight)}
.scr-groups{display:flex;gap:6px;flex-wrap:wrap}
.scr-chip{padding:8px 13px;border:1px solid var(--border);background:var(--surface);border-radius:9px;font:700 12.5px Raleway,sans-serif;color:var(--text2);cursor:pointer;transition:all .14s ease}
.scr-chip:hover{border-color:var(--g3)}
.scr-chip.on{background:var(--g1);color:#fff;border-color:var(--g1)}
.scr-select{padding:9px 12px;border:1px solid var(--border);border-radius:10px;font:600 13px Raleway,sans-serif;background:var(--surface);color:var(--text);max-width:260px}
.scr-toggle{display:flex;align-items:center;gap:7px;font:600 13px Raleway,sans-serif;color:var(--text2);cursor:pointer}
.scr-toggle input{width:16px;height:16px;accent-color:var(--g2)}
.scr-meta{font-size:13px;color:var(--muted);margin-bottom:10px}
.scr-meta b{color:var(--g1)}

/* column chooser */
.scr-colbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding:9px 11px;background:var(--s2);border:1px solid var(--border);border-radius:10px}
.scr-colbar-l{font:700 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-right:2px}
.scr-colchip{padding:5px 10px;border:1px solid var(--border);background:var(--surface);border-radius:7px;font:700 11.5px JetBrains Mono,monospace;color:var(--muted);cursor:pointer;transition:all .12s ease}
.scr-colchip:hover{border-color:var(--g3);color:var(--text2)}
.scr-colchip.on{background:var(--g-xlight);color:var(--g1);border-color:var(--g-light)}

/* category leaders */
.scr-leaders{margin-bottom:18px}
.scr-leaders-h{font:600 11px JetBrains Mono,monospace;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}
.scr-leaders-h em{font-style:normal;text-transform:none;letter-spacing:0;color:var(--muted);font-weight:500}
.scr-leaders-g{color:var(--g1);font-weight:800}
.scr-leaders-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
@media(max-width:860px){.scr-leaders-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.scr-leaders-grid{grid-template-columns:1fr}}
.scr-lead-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 13px;box-shadow:var(--shadow)}
.scr-lead-cat{width:100%;display:flex;align-items:center;justify-content:space-between;background:none;border:0;padding:0 0 8px;margin-bottom:6px;border-bottom:1px solid var(--border);font:800 13.5px Raleway,sans-serif;color:var(--g1);cursor:pointer}
.scr-lead-all{font:600 10px JetBrains Mono,monospace;color:var(--muted)}
.scr-lead-cat:hover .scr-lead-all{color:var(--g2)}
.scr-lead-row{width:100%;display:flex;align-items:center;gap:8px;background:none;border:0;padding:6px 0;text-align:left;cursor:pointer;border-radius:6px}
.scr-lead-row:hover{background:var(--g-xlight)}
.scr-lead-rank{flex:none;width:18px;height:18px;border-radius:50%;background:var(--g-xlight);color:var(--g1);font:800 10px JetBrains Mono,monospace;display:grid;place-items:center}
.scr-lead-name{flex:1;font:600 12px Raleway,sans-serif;color:var(--text);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scr-lead-ret{flex:none;font:800 12.5px JetBrains Mono,monospace}

.scr-table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:var(--shadow)}
.scr-table{width:100%;border-collapse:collapse;font-size:13px;min-width:520px}
.scr-table th{position:sticky;top:0;background:var(--s2);text-align:right;padding:11px 12px;font:700 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap;z-index:2}
.scr-table th.scr-name-h{text-align:left;left:0;z-index:3}
.scr-sortable{cursor:pointer;user-select:none}
.scr-sortable:hover{color:var(--g2)}
.scr-sortable.active{color:var(--g1)}
.scr-arrow{margin-left:3px}
.scr-table td{padding:10px 12px;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:600}
.scr-row{cursor:pointer;transition:background .12s ease}
.scr-row:hover{background:var(--g-xlight)}
.scr-row.row-comparing{background:var(--g-xlight)}
.scr-name,.scr-name-h{text-align:left!important;position:sticky;left:0;background:var(--surface)}
.scr-row:hover .scr-name{background:var(--g-xlight)}
.scr-fundlink{display:flex;flex-direction:column;gap:2px;background:none;border:0;padding:0;text-align:left;cursor:pointer;max-width:230px}
.scr-fund-n{font:700 13px Raleway,sans-serif;color:var(--g1);line-height:1.25;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.scr-fundlink:hover .scr-fund-n{text-decoration:underline}
.scr-fund-sub{font:500 11px JetBrains Mono,monospace;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scr-flag{color:var(--warn);margin-left:5px;font-size:12px}
.scr-pos{color:var(--g2)}
.scr-neg{color:var(--neg)}
.scr-muted{color:var(--muted)}
.scr-more,.scr-loading{padding:14px;text-align:center;color:var(--muted);font-size:13px}
/* pager is OUTSIDE the horizontal-scroll wrap, so it never scrolls sideways */
.scr-pager{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;margin-top:10px;background:var(--s2)}
.scr-pager-info{font-size:12.5px;color:var(--muted)}
.scr-pager-info b{color:var(--text)}
.scr-pager-ctrls{display:flex;align-items:center;gap:10px}
.scr-pg-btn{padding:7px 13px;border:1px solid var(--border);background:var(--surface);border-radius:8px;font:700 12.5px Raleway,sans-serif;color:var(--g1);cursor:pointer}
.scr-pg-btn:hover:not(:disabled){border-color:var(--g3);background:var(--g-xlight)}
.scr-pg-btn:disabled{opacity:.4;cursor:not-allowed;color:var(--muted)}
.scr-pg-now{font:700 12.5px JetBrains Mono,monospace;color:var(--text2);min-width:96px;text-align:center}
.scr-pager-size{display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted)}
.scr-pager-size select{padding:6px 9px;border:1px solid var(--border);border-radius:8px;font:700 12.5px Raleway,sans-serif;background:var(--surface);color:var(--text)}
@media(max-width:560px){
  .scr-pager{justify-content:center}.scr-pager-info{order:3;width:100%;text-align:center}
  /* shrink the sticky fund column so the data columns get room */
  .scr-table{min-width:420px}
  .scr-fundlink{max-width:132px}
  .scr-fund-n{font-size:12px}
  .scr-fund-sub{font-size:9.5px}
  .scr-table th,.scr-table td{padding:9px 8px}
  .scr-name,.scr-name-h{max-width:140px}
}

.scr-faq{margin-top:24px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;box-shadow:var(--shadow)}
.scr-faq h2{font-size:17px;margin:0 0 14px;color:var(--text)}
.scr-faq-item{border:1px solid var(--border);border-radius:10px;background:var(--s2);margin-bottom:8px;overflow:hidden}
.scr-faq-item.open{border-color:var(--g-light)}
.scr-faq-q{width:100%;display:flex;justify-content:space-between;gap:12px;background:none;border:0;padding:14px 15px;text-align:left;font:700 14px Raleway,sans-serif;color:var(--text);cursor:pointer}
.scr-faq-q:hover{color:var(--g1)}
.scr-faq-ic{font:700 18px JetBrains Mono,monospace;color:var(--g3)}
.scr-faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease}
.scr-faq-a p{margin:0;padding:0 15px 15px;font-size:13px;line-height:1.65;color:var(--text2)}
.scr-disc{margin-top:20px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:15px 17px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.scr-disc b{color:var(--text2)}

/* category explainer + FAQ group headings */
.scr-explainer{background:var(--g-xlight);border:1px solid var(--g-light);border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:var(--text2);margin-bottom:16px}
.scr-explainer b{color:var(--g1)}
.scr-faq-group-h{font:700 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:18px 0 8px}
h2 + .scr-faq-group-h{margin-top:0}

/* drawer */
.scr-drawer-wrap{position:fixed;inset:0;background:#0d260d55;backdrop-filter:blur(3px);z-index:10000;display:flex;justify-content:flex-end;animation:scrfade .2s ease}
.scr-drawer{background:var(--surface);width:460px;max-width:100%;height:100%;overflow-y:auto;box-shadow:var(--shadow-lg);padding:22px;animation:scrslide .28s cubic-bezier(.2,.7,.3,1)}
@keyframes scrfade{from{opacity:0}to{opacity:1}}
@keyframes scrslide{from{transform:translateX(40px);opacity:.4}to{transform:none;opacity:1}}
@keyframes scrup{from{transform:translateY(60px);opacity:.5}to{transform:none;opacity:1}}
.scr-drawer-h{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:14px}
.scr-drawer-name{font-size:16px;font-weight:800;color:var(--text);line-height:1.3}
.scr-drawer-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.scr-tag{font:700 10px JetBrains Mono,monospace;background:var(--g-xlight);color:var(--g1);padding:3px 8px;border-radius:5px}
.scr-tag.alt{background:var(--s3,#eef5ee);color:var(--text2)}
.scr-x{width:34px;height:34px;border:1px solid var(--border);background:var(--surface);border-radius:9px;font-size:20px;color:var(--muted);cursor:pointer;flex:none}
.scr-warn{background:var(--warn-bg,#fff3e0);border:1px solid #ffcc80;color:#8a4300;padding:9px 12px;border-radius:8px;font-size:12px;margin-bottom:14px}
.scr-spark-load{font:500 11px JetBrains Mono,monospace;color:var(--muted);margin-top:5px;padding:34px 0;text-align:center}
.scr-drawer-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.scr-dk{background:var(--s2);border:1px solid var(--border);border-radius:9px;padding:9px 10px;display:flex;flex-direction:column;gap:3px}
.scr-dk span{font:600 9.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase}
.scr-dk b{font:800 16px JetBrains Mono,monospace;color:var(--text)}
.scr-drawer-meta{display:flex;flex-wrap:wrap;gap:12px;font:600 11px JetBrains Mono,monospace;color:var(--muted);border-top:1px solid var(--border);padding-top:12px;margin-bottom:16px}
.scr-drawer-cta{display:flex;gap:10px;flex-wrap:wrap}
.scr-btn{flex:1;text-align:center;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:800 13px Raleway,sans-serif;text-decoration:none;white-space:nowrap}
.scr-btn.primary{background:var(--g1);color:#fff;border-color:var(--g1)}
.scr-btn:hover{transform:translateY(-1px)}
@media(max-width:560px){
  .scr-drawer-wrap{justify-content:center;align-items:flex-end}
  .scr-drawer{width:100%;height:auto;max-height:90vh;border-radius:18px 18px 0 0;animation:scrup .3s cubic-bezier(.2,.7,.3,1)}
  .scr-drawer-kpis{grid-template-columns:repeat(2,1fr)}
  .scr-select{max-width:100%;flex:1}
}
@media (prefers-reduced-motion: reduce){ .scr-drawer,.scr-drawer-wrap{animation:none} .scr-btn:hover{transform:none} }

/* Table liquidity badge styles */
.scr-table-liq-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  padding: 1px 5px;
  font: 700 9px JetBrains Mono, monospace;
  margin-left: 6px;
  vertical-align: middle;
}
.scr-table-liq-green {
  background: rgba(46, 125, 50, 0.08);
  color: #2e7d32;
  border: 1px solid rgba(46, 125, 50, 0.15);
}
.scr-table-liq-amber {
  background: rgba(230, 81, 0, 0.08);
  color: #e65100;
  border: 1px solid rgba(230, 81, 0, 0.15);
}
.scr-table-liq-red {
  background: rgba(211, 47, 47, 0.08);
  color: #d32f2f;
  border: 1px solid rgba(211, 47, 47, 0.15);
}

/* Stress test section in drawer */
.scr-stress-section {
  border-top: 1px solid var(--border);
  padding-top: 16px;
  margin-top: 16px;
}
.scr-stress-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 4px;
}
.scr-stress-month {
  font: 500 11px JetBrains Mono, monospace;
  color: var(--muted);
  margin-bottom: 12px;
}
.scr-stress-liquidity-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.scr-stress-liq-card {
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.scr-liq-label {
  font-size: 9px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.scr-liq-val {
  font: 800 18px JetBrains Mono, monospace;
  color: var(--text);
}
.scr-liq-meter {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 2px;
}
.scr-liq-meter-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}
.scr-warn-liquidity {
  background: rgba(230, 81, 0, 0.08);
  border: 1px solid rgba(230, 81, 0, 0.15);
  color: #e65100;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 11px;
  margin-bottom: 12px;
  line-height: 1.4;
}
.scr-allocation-card, .scr-valuation-card {
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.scr-alloc-title {
  font-size: 10px;
  font-weight: 800;
  color: var(--muted);
  text-transform: uppercase;
  margin-bottom: 10px;
  letter-spacing: 0.03em;
}
.scr-alloc-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.scr-alloc-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.scr-alloc-lbl {
  font: 600 10.5px JetBrains Mono, monospace;
  color: var(--text2);
}
.scr-alloc-bar-bg {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.scr-alloc-bar-fill {
  height: 100%;
  border-radius: 3px;
}
.scr-alloc-bar-fill.large-cap { background: #1b5e20; }
.scr-alloc-bar-fill.mid-cap { background: #2e7d32; }
.scr-alloc-bar-fill.small-cap { background: #e65100; }
.scr-alloc-bar-fill.cash { background: #0288d1; }

@media(max-width:560px){
  .scr-pager{justify-content:center}.scr-pager-info{order:3;width:100%;text-align:center}
  /* shrink the sticky fund column so the data columns get room */
  .scr-table{min-width:420px}
  .scr-fundlink{max-width:132px}
  .scr-fund-n{font-size:12px}
  .scr-fund-sub{font-size:9.5px}
  .scr-table th,.scr-table td{padding:9px 8px}
  .scr-name,.scr-name-h{max-width:140px}
}

.scr-faq{margin-top:24px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;box-shadow:var(--shadow)}
.scr-faq h2{font-size:17px;margin:0 0 14px;color:var(--text)}
.scr-faq-item{border:1px solid var(--border);border-radius:10px;background:var(--s2);margin-bottom:8px;overflow:hidden}
.scr-faq-item.open{border-color:var(--g-light)}
.scr-faq-q{width:100%;display:flex;justify-content:space-between;gap:12px;background:none;border:0;padding:14px 15px;text-align:left;font:700 14px Raleway,sans-serif;color:var(--text);cursor:pointer}
.scr-faq-q:hover{color:var(--g1)}
.scr-faq-ic{font:700 18px JetBrains Mono,monospace;color:var(--g3)}
.scr-faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease}
.scr-faq-a p{margin:0;padding:0 15px 15px;font-size:13px;line-height:1.65;color:var(--text2)}
.scr-disc{margin-top:20px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:15px 17px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.scr-disc b{color:var(--text2)}

/* category explainer + FAQ group headings */
.scr-explainer{background:var(--g-xlight);border:1px solid var(--g-light);border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:var(--text2);margin-bottom:16px}
.scr-explainer b{color:var(--g1)}
.scr-faq-group-h{font:700 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:18px 0 8px}
h2 + .scr-faq-group-h{margin-top:0}

/* drawer */
.scr-drawer-wrap{position:fixed;inset:0;background:#0d260d55;backdrop-filter:blur(3px);z-index:10000;display:flex;justify-content:flex-end;animation:scrfade .2s ease}
.scr-drawer{background:var(--surface);width:460px;max-width:100%;height:100%;overflow-y:auto;box-shadow:var(--shadow-lg);padding:22px;animation:scrslide .28s cubic-bezier(.2,.7,.3,1)}
@keyframes scrfade{from{opacity:0}to{opacity:1}}
@keyframes scrslide{from{transform:translateX(40px);opacity:.4}to{transform:none;opacity:1}}
@keyframes scrup{from{transform:translateY(60px);opacity:.5}to{transform:none;opacity:1}}
.scr-drawer-h{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:14px}
.scr-drawer-name{font-size:16px;font-weight:800;color:var(--text);line-height:1.3}
.scr-drawer-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.scr-tag{font:700 10px JetBrains Mono,monospace;background:var(--g-xlight);color:var(--g1);padding:3px 8px;border-radius:5px}
.scr-tag.alt{background:var(--s3,#eef5ee);color:var(--text2)}
.scr-x{width:34px;height:34px;border:1px solid var(--border);background:var(--surface);border-radius:9px;font-size:20px;color:var(--muted);cursor:pointer;flex:none}
.scr-warn{background:var(--warn-bg,#fff3e0);border:1px solid #ffcc80;color:#8a4300;padding:9px 12px;border-radius:8px;font-size:12px;margin-bottom:14px}
.scr-spark-load{font:500 11px JetBrains Mono,monospace;color:var(--muted);margin-top:5px;padding:34px 0;text-align:center}
.scr-drawer-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.scr-dk{background:var(--s2);border:1px solid var(--border);border-radius:9px;padding:9px 10px;display:flex;flex-direction:column;gap:3px}
.scr-dk span{font:600 9.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase}
.scr-dk b{font:800 16px JetBrains Mono,monospace;color:var(--text)}
.scr-drawer-meta{display:flex;flex-wrap:wrap;gap:12px;font:600 11px JetBrains Mono,monospace;color:var(--muted);border-top:1px solid var(--border);padding-top:12px;margin-bottom:16px}
.scr-drawer-cta{display:flex;gap:10px;flex-wrap:wrap}
.scr-btn{flex:1;text-align:center;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:800 13px Raleway,sans-serif;text-decoration:none;white-space:nowrap}
.scr-btn.primary{background:var(--g1);color:#fff;border-color:var(--g1)}
.scr-btn:hover{transform:translateY(-1px)}
@media(max-width:560px){
  .scr-drawer-wrap{justify-content:center;align-items:flex-end}
  .scr-drawer{width:100%;height:auto;max-height:90vh;border-radius:18px 18px 0 0;animation:scrup .3s cubic-bezier(.2,.7,.3,1)}
  .scr-drawer-kpis{grid-template-columns:repeat(2,1fr)}
  .scr-select{max-width:100%;flex:1}
}
@media (prefers-reduced-motion: reduce){ .scr-drawer,.scr-drawer-wrap{animation:none} .scr-btn:hover{transform:none} }

/* Table liquidity badge styles */
.scr-table-liq-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  padding: 1px 5px;
  font: 700 9px JetBrains Mono, monospace;
  margin-left: 6px;
  vertical-align: middle;
}
.scr-table-liq-green {
  background: rgba(46, 125, 50, 0.08);
  color: #2e7d32;
  border: 1px solid rgba(46, 125, 50, 0.15);
}
.scr-table-liq-amber {
  background: rgba(230, 81, 0, 0.08);
  color: #e65100;
  border: 1px solid rgba(230, 81, 0, 0.15);
}
.scr-table-liq-red {
  background: rgba(211, 47, 47, 0.08);
  color: #d32f2f;
  border: 1px solid rgba(211, 47, 47, 0.15);
}

/* Stress test section in drawer */
.scr-stress-section {
  border-top: 1px solid var(--border);
  padding-top: 16px;
  margin-top: 16px;
}
.scr-stress-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 4px;
}
.scr-stress-month {
  font: 500 11px JetBrains Mono, monospace;
  color: var(--muted);
  margin-bottom: 12px;
}
.scr-stress-liquidity-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.scr-stress-liq-card {
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.scr-liq-label {
  font-size: 9px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.scr-liq-val {
  font: 800 18px JetBrains Mono, monospace;
  color: var(--text);
}
.scr-liq-meter {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 2px;
}
.scr-liq-meter-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}
.scr-warn-liquidity {
  background: rgba(230, 81, 0, 0.08);
  border: 1px solid rgba(230, 81, 0, 0.15);
  color: #e65100;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 11px;
  margin-bottom: 12px;
  line-height: 1.4;
}
.scr-allocation-card, .scr-valuation-card {
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.scr-alloc-title {
  font-size: 10px;
  font-weight: 800;
  color: var(--muted);
  text-transform: uppercase;
  margin-bottom: 10px;
  letter-spacing: 0.03em;
}
.scr-alloc-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.scr-alloc-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.scr-alloc-lbl {
  font: 600 10.5px JetBrains Mono, monospace;
  color: var(--text2);
}
.scr-alloc-bar-bg {
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.scr-alloc-bar-fill {
  height: 100%;
  border-radius: 3px;
}
.scr-alloc-bar-fill.large-cap { background: #1b5e20; }
.scr-alloc-bar-fill.mid-cap { background: #2e7d32; }
.scr-alloc-bar-fill.small-cap { background: #e65100; }
.scr-alloc-bar-fill.cash { background: #0288d1; }

.scr-pe-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.scr-pe-label {
  font-size: 9px;
  color: var(--muted);
  font-weight: 600;
  margin-bottom: 2px;
  text-transform: uppercase;
}
.scr-pe-val {
  font: 800 16px JetBrains Mono, monospace;
  color: var(--text);
}
.scr-pe-history {
  font: 500 10px JetBrains Mono, monospace;
  color: var(--muted);
  text-align: center;
  margin-top: 8px;
  border-top: 1px dashed var(--border);
  padding-top: 6px;
}

/* Holdings section in drawer */
.scr-hold-section{border-top:1px solid var(--border);padding-top:16px;margin-top:16px}
.scr-hold-title{font-size:14px;font-weight:800;color:var(--text);margin-bottom:12px}
.scr-hold-table-wrap{overflow-x:auto;margin-bottom:12px;-webkit-overflow-scrolling:touch}
.scr-hold-table{width:100%;border-collapse:collapse;font:500 12px Raleway,sans-serif}
.scr-hold-table th{font:700 9px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;padding:6px 8px;border-bottom:1.5px solid var(--border);text-align:left}
.scr-hold-table td{padding:7px 8px;border-bottom:1px solid var(--border);color:var(--text);font-size:12px}
.scr-hold-stock{font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scr-hold-sector{font:500 10px JetBrains Mono,monospace;color:var(--muted)}
.scr-hold-pct{font:700 12px JetBrains Mono,monospace;text-align:right;color:var(--g1)}
.scr-hold-toggle{display:block;width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--s2);color:var(--g1);font:700 11px JetBrains Mono,monospace;cursor:pointer;text-align:center;margin-bottom:12px;transition:background .15s}
.scr-hold-toggle:hover{background:var(--g-xlight)}
.scr-hold-empty{font:500 11px JetBrains Mono,monospace;color:var(--muted);text-align:center;padding:16px 0}

/* Holdings gating & paywall modal */
.scr-hold-row-locked {
  cursor: pointer;
  background: var(--s2);
  transition: background 0.15s ease;
}
.scr-hold-row-locked:hover {
  background: var(--g-xlight);
}
.scr-hold-locked-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px;
  font: 700 11px JetBrains Mono, monospace;
  color: var(--muted);
}
.scr-hold-pro-badge {
  background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%);
  color: #fff;
  font: 800 9px JetBrains Mono, monospace;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}
.scr-hold-toggle-wrap {
  margin-bottom: 12px;
}
.scr-hold-pro-teaser {
  background: linear-gradient(135deg, var(--s2) 0%, var(--g-xlight) 100%);
  border: 1.5px solid var(--g-light);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.scr-hold-pro-teaser:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow);
  border-color: var(--g2);
}
.scr-hold-teaser-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.scr-hold-teaser-crown {
  font-size: 22px;
  line-height: 1;
}
.scr-hold-teaser-head {
  font: 800 12.5px Raleway, sans-serif;
  color: var(--text);
}
.scr-hold-teaser-sub {
  font: 500 11px Raleway, sans-serif;
  color: var(--muted);
}
.scr-hold-teaser-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px;
  border: 0;
  border-radius: 8px;
  background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%);
  color: #fff;
  font: 800 12px Raleway, sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(27, 94, 32, 0.25);
  transition: opacity 0.15s ease;
}
.scr-hold-teaser-btn:hover {
  opacity: 0.92;
}
.scr-hold-btn-tag {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  font: 800 9px JetBrains Mono, monospace;
  padding: 2px 5px;
  border-radius: 4px;
}

/* Modal Window */
.scr-pro-modal-wrap {
  position: fixed;
  inset: 0;
  background: rgba(13, 38, 13, 0.72);
  backdrop-filter: blur(6px);
  z-index: 10005;
  display: grid;
  place-items: center;
  padding: 16px;
  animation: scrfade 0.2s ease;
}
.scr-pro-modal {
  background: var(--surface);
  border: 1.5px solid var(--g-light);
  border-radius: 18px;
  max-width: 480px;
  width: 100%;
  padding: 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
  position: relative;
  animation: scrup 0.25s cubic-bezier(0.2, 0.7, 0.3, 1);
}
.scr-pro-modal-x {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  background: var(--s2);
  border-radius: 8px;
  font-size: 20px;
  color: var(--muted);
  cursor: pointer;
  display: grid;
  place-items: center;
}
.scr-pro-modal-x:hover {
  color: var(--text);
  border-color: var(--g3);
}
.scr-pro-modal-header {
  text-align: center;
  margin-bottom: 18px;
}
.scr-pro-crown-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--g-xlight);
  color: var(--g1);
  border: 1px solid var(--g-light);
  border-radius: 20px;
  padding: 4px 12px;
  font: 800 10.5px JetBrains Mono, monospace;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}
.scr-pro-modal-title {
  font: 800 19px Raleway, sans-serif;
  color: var(--text);
  margin: 0 0 6px;
  line-height: 1.25;
}
.scr-pro-modal-desc {
  font: 500 12.5px/1.55 Raleway, sans-serif;
  color: var(--text2);
  margin: 0;
}
.scr-pro-features-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.scr-pro-feat-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.scr-pro-feat-ic {
  font-size: 18px;
  flex: none;
  margin-top: 1px;
}
.scr-pro-feat-item strong {
  display: block;
  font: 700 12.5px Raleway, sans-serif;
  color: var(--text);
  margin-bottom: 2px;
}
.scr-pro-feat-item span {
  display: block;
  font: 500 11.5px/1.4 Raleway, sans-serif;
  color: var(--muted);
}
.scr-pro-pricing-card {
  background: linear-gradient(135deg, var(--s2) 0%, var(--g-xlight) 100%);
  border: 1.5px solid var(--g-light);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
}
.scr-pro-price-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}
.scr-pro-price-amount {
  font: 800 24px JetBrains Mono, monospace;
  color: var(--g1);
}
.scr-pro-price-period {
  font: 600 12px Raleway, sans-serif;
  color: var(--muted);
  margin-left: 4px;
}
.scr-pro-price-total {
  font: 700 11px JetBrains Mono, monospace;
  color: var(--muted);
}
.scr-pro-cta {
  width: 100%;
  padding: 12px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%);
  color: #fff;
  font: 800 14px Raleway, sans-serif;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(27, 94, 32, 0.3);
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.scr-pro-cta:hover:not(:disabled) {
  transform: translateY(-1px);
  opacity: 0.95;
}
.scr-pro-cta:disabled {
  opacity: 0.6;
  cursor: wait;
}
.scr-pro-err {
  color: #d32f2f;
  font-size: 11.5px;
  margin-top: 8px;
}
.scr-pro-sublink {
  margin-top: 10px;
}
.scr-pro-sublink a {
  font: 600 11.5px Raleway, sans-serif;
  color: var(--g1);
  text-decoration: none;
}
.scr-pro-sublink a:hover {
  text-decoration: underline;
}

@media(max-width:860px){
  .scr-leaders-grid{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:560px){
  .scr-leaders-grid{grid-template-columns:1fr}
  .scr-pager{justify-content:center}
  .scr-pager-info{order:3;width:100%;text-align:center}
  .scr-table{min-width:420px}
  .scr-fundlink{max-width:132px}
  .scr-fund-n{font-size:12px}
  .scr-fund-sub{font-size:9.5px}
  .scr-table th,.scr-table td{padding:9px 8px}
  .scr-name,.scr-name-h{max-width:140px}
  .scr-drawer-wrap{justify-content:center;align-items:flex-end}
  .scr-drawer{width:100%;height:auto;max-height:90vh;border-radius:18px 18px 0 0;animation:scrup .3s cubic-bezier(.2,.7,.3,1)}
  .scr-drawer-kpis{grid-template-columns:repeat(2,1fr)}
  .scr-select{max-width:100%;flex:1}
  .scr-hold-stock{max-width:120px}
  .scr-hold-table th,.scr-hold-table td{padding:6px 6px}
}
@media (prefers-reduced-motion: reduce){ .scr-drawer,.scr-drawer-wrap{animation:none} .scr-btn:hover{transform:none} }
`;
