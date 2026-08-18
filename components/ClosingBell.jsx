'use client';

import { useEffect, useRef, useState } from 'react';
import { computeIstNow, shouldRingNow } from '@/lib/closingBell';

const POLL_INTERVAL_MS = 15_000;
const LOCAL_STORAGE_KEY = 'mfcalc_closing_bell_last_rung';
const TOAST_DURATION_MS = 5_000;

// Two-note bell chime synthesized with the Web Audio API -- no external
// audio file (avoids bundling/licensing an asset). A bright fundamental +
// an inharmonic overtone per note, each with a quick exponential decay,
// played twice in quick succession to loosely mimic a real bell strike.
// See docs/superpowers/specs/2026-08-19-closing-bell-design.md's Sound
// section. The caller wraps this in try/catch -- AudioContext can throw
// or be blocked in some browser/embed contexts.
function playBellChime() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();

  function strike(startTime) {
    const fundamental = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const gain = ctx.createGain();

    fundamental.type = 'sine';
    fundamental.frequency.value = 880; // A5
    overtone.type = 'sine';
    overtone.frequency.value = 880 * 2.4; // inharmonic overtone -- bell-like, not a clean octave

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.3);

    fundamental.connect(gain);
    overtone.connect(gain);
    gain.connect(ctx.destination);

    fundamental.start(startTime);
    overtone.start(startTime);
    fundamental.stop(startTime + 1.4);
    overtone.stop(startTime + 1.4);
  }

  const now = ctx.currentTime;
  strike(now);
  strike(now + 0.55);

  // Let the tail ring out, then release the context.
  setTimeout(() => ctx.close().catch(() => {}), 2200);
}

export default function ClosingBell() {
  const [toastVisible, setToastVisible] = useState(false);
  const holidaysRef = useRef([]);
  const holidaysLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/market-holidays')
      .then(r => (r.ok ? r.json() : { holidays: [] }))
      .then(d => { if (!cancelled) holidaysRef.current = d.holidays || []; })
      .catch(() => { if (!cancelled) holidaysRef.current = []; }) // fail loose -- see spec's Data source section
      .finally(() => { if (!cancelled) holidaysLoadedRef.current = true; });

    function tick() {
      if (document.visibilityState !== 'visible') return;
      if (!holidaysLoadedRef.current) return; // don't guess before the holiday list has loaded at least once

      const istNow = computeIstNow();
      const lastRungDateStr = window.localStorage.getItem(LOCAL_STORAGE_KEY);

      if (shouldRingNow({ istNow, holidayDates: holidaysRef.current, lastRungDateStr })) {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, istNow.dateStr);
        try { playBellChime(); } catch { /* sound is best-effort -- toast still shows */ }
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), TOAST_DURATION_MS);
      }
    }

    const intervalId = setInterval(tick, POLL_INTERVAL_MS);
    // Also check immediately on mount, and whenever the tab regains
    // visibility -- catches the "tabbed back in during the live window"
    // case as fast as possible instead of waiting up to 15s for the next
    // poll. shouldRingNow()'s own conditions are the single source of
    // truth regardless of which of these triggers the check.
    tick();
    document.addEventListener('visibilitychange', tick);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  if (!toastVisible) return null;

  return (
    <div className="closing-bell-toast" role="status" aria-live="polite">
      🔔 Market Closed for the day
    </div>
  );
}
