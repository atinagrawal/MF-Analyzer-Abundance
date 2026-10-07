'use client';

/**
 * app/sifs/reports/performance/[category]/PeriodSelect.jsx
 *
 * Tiny client component: a <select> that navigates to ?month=YYYY-MM (or
 * strips it for "Till Date") on change. Kept separate from the server
 * component page so only this one interactive control hydrates as JS --
 * the table data itself is still real server-rendered HTML either way.
 */

import { useRouter } from 'next/navigation';

export default function PeriodSelect({ slug, current, months }) {
  const router = useRouter();

  function handleChange(e) {
    const value = e.target.value;
    const base = `/sifs/reports/performance/${slug}`;
    router.push(value === 'till-date' ? base : `${base}?month=${value}`);
  }

  return (
    <select
      className="sifr-period-select"
      value={current || 'till-date'}
      onChange={handleChange}
      aria-label="Report period"
    >
      <option value="till-date">Till Date</option>
      {months.map((m) => (
        <option key={m.value} value={m.value}>{m.label}</option>
      ))}
    </select>
  );
}
