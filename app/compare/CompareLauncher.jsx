'use client';

/**
 * app/compare/CompareLauncher.jsx
 *
 * Interactive comparator launcher allowing users to select any two funds
 * and navigate directly to their dedicated canonical comparison page.
 *
 * Type-to-search combobox rather than a native <select> -- the full
 * `funds` list is the whole mf_screener universe (1,700+ schemes), which
 * made the old dropdown a multi-thousand-row scroll with no way to jump
 * to a fund by name. Filtering is done in-memory against the already-
 * loaded `funds` array (no network round-trip needed), so results update
 * on every keystroke.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCanonicalCompareSlug } from '@/lib/compareSlug';

const MAX_RESULTS = 20;

function FundCombobox({ label, funds, excludeCode, selectedCode, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimerRef = useRef(null);

  const selected = selectedCode ? funds.find((f) => String(f.code) === String(selectedCode)) : null;

  useEffect(() => {
    // Keep the input's displayed text in sync when a fund is picked (and
    // clear it back to a placeholder-driven empty state if selection is
    // reset by the parent, e.g. after a successful navigation).
    setQuery(selected ? `${selected.name} (${selected.amc})` : '');
  }, [selected?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const results =
    q.length < 1
      ? []
      : funds
          .filter((f) => String(f.code) !== String(excludeCode))
          .filter((f) => f.name.toLowerCase().includes(q) || (f.amc || '').toLowerCase().includes(q))
          .slice(0, MAX_RESULTS);

  function handleFocus() {
    clearTimeout(blurTimerRef.current);
    setOpen(true);
  }
  function handleBlur() {
    // Delay so a click on a dropdown option registers before we close it.
    blurTimerRef.current = setTimeout(() => setOpen(false), 150);
  }
  function handleChange(e) {
    setQuery(e.target.value);
    setOpen(true);
    if (selected) onSelect(null); // typing again clears any prior pick
  }
  function pick(f) {
    onSelect(f);
    setQuery(`${f.name} (${f.amc})`);
    setOpen(false);
  }

  return (
    <div className="cmp-launcher-combo">
      <input
        type="text"
        className="cmp-launcher-search"
        placeholder={label}
        aria-label={label}
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoComplete="off"
      />
      {open && q.length >= 1 && (
        <ul className="cmp-launcher-dropdown">
          {results.length === 0 ? (
            <li className="cmp-launcher-dropdown-empty">No matching funds</li>
          ) : (
            results.map((f) => (
              <li
                key={f.code}
                className="cmp-launcher-dropdown-item"
                // onMouseDown (not onClick) fires before the input's onBlur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(f);
                }}
              >
                <span className="cmp-launcher-dropdown-name">{f.name}</span>
                <span className="cmp-launcher-dropdown-amc">{f.amc}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default function CompareLauncher({ funds = [] }) {
  const router = useRouter();
  const [fund1, setFund1] = useState(null);
  const [fund2, setFund2] = useState(null);

  const handleCompare = (e) => {
    e.preventDefault();
    if (!fund1 || !fund2 || fund1.code === fund2.code) return;

    const slug = getCanonicalCompareSlug([fund1, fund2]);
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
        <FundCombobox
          label="Search Fund 1…"
          funds={funds}
          excludeCode={fund2?.code}
          selectedCode={fund1?.code}
          onSelect={setFund1}
        />

        <span className="cmp-launcher-vs">VS</span>

        <FundCombobox
          label="Search Fund 2…"
          funds={funds}
          excludeCode={fund1?.code}
          selectedCode={fund2?.code}
          onSelect={setFund2}
        />

        <button
          type="submit"
          className="cmp-launcher-btn"
          disabled={!fund1 || !fund2 || fund1.code === fund2.code}
        >
          Compare Now →
        </button>
      </form>
    </div>
  );
}
