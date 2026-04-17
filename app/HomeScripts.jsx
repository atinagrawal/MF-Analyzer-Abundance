'use client';

import Script from 'next/script';

/**
 * app/HomeScripts.jsx — Client Component
 *
 * Loads Chart.js then mfcalc-main.js in guaranteed order.
 *
 * Chart.js MUST be available before mfcalc-main.js executes because
 * restoreState() (called at the bottom of mfcalc-main.js) invokes
 * calcSIP/calcGoal/calcSWP/calcEMI when localStorage values exist,
 * and those functions call `new Chart(...)`.
 *
 * The onLoad callback on the Chart.js Script injects mfcalc-main.js
 * only after Chart is confirmed ready in the global scope.
 */
export default function HomeScripts() {
  return (
    <Script
      src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"
      strategy="afterInteractive"
      onLoad={() => {
        const s = document.createElement('script');
        s.src = '/js/mfcalc-main.js';
        s.defer = true;
        document.head.appendChild(s);
      }}
    />
  );
}
