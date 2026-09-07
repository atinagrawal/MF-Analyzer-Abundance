'use client';

import { useState } from 'react';
import { getProviderLogo } from '@/lib/providerLogos';

// `todayStr` is computed ONCE, server-side, by app/nfo/page.jsx and threaded
// down as a prop -- never call `new Date()` directly in this client
// component, since it server-renders into HTML cached for up to 1h and a
// client-computed "today" can disagree with the server's (a real hydration
// mismatch around the UTC/IST date-rollover window).
function closesInDays(closeDate, todayStr) {
  if (!closeDate || !todayStr) return null;
  const today = new Date(todayStr + 'T00:00:00');
  const close = new Date(closeDate + 'T00:00:00');
  return Math.round((close - today) / 86400000);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRupees(n) {
  if (n === null || n === undefined) return null;
  return new Intl.NumberFormat('en-IN').format(n);
}

function NfoCard({ entry, today }) {
  const logo = getProviderLogo(entry.type, entry.amcName);
  const daysLeft = closesInDays(entry.closeDate, today);

  return (
    <a href={`/nfo/${entry.slug}`} className="nfo-card">
      <div className="nfo-card-top">
        {logo ? (
          <img src={logo} alt={entry.amcName || ''} className="nfo-card-logo" />
        ) : (
          <span className="nfo-card-logo-fallback">{(entry.amcName || '?').charAt(0)}</span>
        )}
        <span className="nfo-card-category">{entry.category || entry.schemeType || 'NFO'}</span>
      </div>
      <h3 className="nfo-card-name">{entry.schemeName}</h3>
      <p className="nfo-card-amc">{entry.amcName}</p>
      <div className="nfo-card-facts">
        <span>Opens {formatDate(entry.openDate)}</span>
        <span>Closes {formatDate(entry.closeDate)}</span>
      </div>
      <div className="nfo-card-bottom">
        {entry.minInvestment != null && <span className="nfo-card-min">Min ₹{formatRupees(entry.minInvestment)}</span>}
        {daysLeft != null && daysLeft >= 0 && (
          <span className="nfo-chip">{daysLeft === 0 ? 'Closes today' : `Closes in ${daysLeft}d`}</span>
        )}
      </div>
    </a>
  );
}

function EmptyState({ message, href, linkLabel }) {
  return (
    <div className="nfo-empty-state">
      <p>{message}</p>
      <a href={href}>{linkLabel} →</a>
    </div>
  );
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'mf', label: 'Mutual Fund' },
  { key: 'sif', label: 'SIF' },
];

export default function NfoFilterTabs({ mf, sif, today }) {
  const [tab, setTab] = useState('all');
  const entries = tab === 'mf' ? mf : tab === 'sif' ? sif : [...mf, ...sif];

  return (
    <div className="nfo-tabs-wrap">
      <div className="nfo-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`nfo-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sif' && sif.length === 0 && (
        <EmptyState message="No SIF NFOs are open right now." href="/sifs" linkLabel="Browse the SIF Screener" />
      )}
      {tab === 'mf' && mf.length === 0 && (
        <EmptyState message="No mutual fund NFOs are open right now." href="/screener" linkLabel="Browse the MF Screener" />
      )}
      {tab === 'all' && entries.length === 0 && (
        <EmptyState message="No NFOs are open right now." href="/screener" linkLabel="Browse the MF Screener" />
      )}

      {entries.length > 0 && (
        <div className="nfo-card-grid">
          {entries.map((e) => (
            <NfoCard key={`${e.type}-${e.schemeId}`} entry={e} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}
