'use client';

/**
 * app/compare/CompareLauncher.jsx
 *
 * Interactive comparator launcher allowing users to select any two funds
 * and navigate directly to their dedicated canonical comparison page.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toFundSlug, getCanonicalCompareSlug } from '@/lib/compareSlug';

export default function CompareLauncher({ funds = [] }) {
  const router = useRouter();
  const [fund1Code, setFund1Code] = useState('');
  const [fund2Code, setFund2Code] = useState('');

  const handleCompare = (e) => {
    e.preventDefault();
    if (!fund1Code || !fund2Code || fund1Code === fund2Code) return;

    const f1 = funds.find((f) => String(f.code) === String(fund1Code));
    const f2 = funds.find((f) => String(f.code) === String(fund2Code));
    if (!f1 || !f2) return;

    const slug = getCanonicalCompareSlug([f1, f2]);
    if (slug) {
      router.push(`/compare/${slug}`);
    }
  };

  return (
    <div className="cmp-launcher-card">
      <div className="cmp-launcher-title">
        <span>⚖ Compare Any Two Mutual Funds</span>
      </div>
      <div className="cmp-launcher-sub">
        Select two schemes to analyze head-to-head performance, portfolio overlap, market cap allocation, and risk metrics.
      </div>

      <form className="cmp-launcher-form" onSubmit={handleCompare}>
        <select
          className="cmp-launcher-select"
          value={fund1Code}
          onChange={(e) => setFund1Code(e.target.value)}
          aria-label="Select first mutual fund"
          required
        >
          <option value="">Select Fund 1…</option>
          {funds.map((f) => (
            <option key={f.code} value={f.code} disabled={String(f.code) === String(fund2Code)}>
              {f.name} ({f.amc})
            </option>
          ))}
        </select>

        <span className="cmp-launcher-vs">VS</span>

        <select
          className="cmp-launcher-select"
          value={fund2Code}
          onChange={(e) => setFund2Code(e.target.value)}
          aria-label="Select second mutual fund"
          required
        >
          <option value="">Select Fund 2…</option>
          {funds.map((f) => (
            <option key={f.code} value={f.code} disabled={String(f.code) === String(fund1Code)}>
              {f.name} ({f.amc})
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="cmp-launcher-btn"
          disabled={!fund1Code || !fund2Code || fund1Code === fund2Code}
        >
          Compare Now →
        </button>
      </form>
    </div>
  );
}
