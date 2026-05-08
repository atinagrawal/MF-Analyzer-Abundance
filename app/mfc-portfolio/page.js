/**
 * app/mfc-portfolio/page.js
 *
 * MF Central Portfolio Importer
 * Upload your MF Central Consolidated Account Statement PDF →
 * get a live-NAV portfolio view instantly.
 *
 * No password required (MF Central PDFs are not password-protected).
 * Covers all AMCs across CAMS + KFintech (single PAN).
 */
'use client';

import { useState, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const fmt = v => v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtRs = v => v == null ? '—' : '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtUnits = v => v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const pct = (a, b) => b ? (((a - b) / b) * 100).toFixed(2) + '%' : '—';

export default function MfcPortfolioPage() {
  const [stage, setStage] = useState('upload');  // upload | parsing | result | error
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  async function handleFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setErrMsg('Please upload a PDF file.');
      setStage('error');
      return;
    }
    setStage('parsing');
    setErrMsg('');

    const fd = new FormData();
    fd.append('file', file);

    try {
      const r = await fetch('/api/parse-mfc', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok || d.detail) throw new Error(d.detail || 'Parse failed');
      const byIsin = {};
      for (const h of (d.holdings || [])) {
        if (!byIsin[h.isin]) { byIsin[h.isin] = { ...h, folios: [] }; }
        else {
          byIsin[h.isin].units = (byIsin[h.isin].units || 0) + (h.units || 0);
          byIsin[h.isin].value_live = (byIsin[h.isin].value_live || 0) + (h.value_live || 0);
        }
        byIsin[h.isin].folios.push(h.folio);
      }
      const consolidated = Object.values(byIsin);
      const totalValue = consolidated.reduce((s, h) => s + (h.value_live || 0), 0);
      d.consolidated = consolidated;
      d.summary = { total_value: Math.round(totalValue), total_holdings: consolidated.length, total_folios: (d.holdings || []).length, statement_date: d.period?.to || '' };
      setResult(d);
      setStage('result');
    } catch (e) {
      setErrMsg(e.message);
      setStage('error');
    }
  }

  function reset() { setStage('upload'); setResult(null); setErrMsg(''); }

  // ── Upload zone ────────────────────────────────────────────────────────────
  const UploadZone = () => (
    <div className="mfc-page">
      <div className="page-header">
        <h1 className="page-title">🏦 MF Central Portfolio</h1>
        <div className="page-subtitle">
          Upload your MF Central Consolidated Account Statement PDF for an instant live-NAV portfolio view.
          No password required — covers all AMCs across CAMS & KFintech.
        </div>
      </div>

      {/* How to get the PDF */}
      <div className="mfc-guide">
        <div className="mfc-guide-title">How to download your MF Central Statement</div>
        <div className="mfc-guide-steps">
          {[
            ['1', 'Visit', 'app.mfcentral.com', 'https://app.mfcentral.com'],
            ['2', 'Log in with your PAN and registered mobile OTP', null, null],
            ['3', 'Go to Statements → Consolidated Account Statement', null, null],
            ['4', 'Select "Detailed" type and download as PDF', null, null],
            ['5', 'Upload the PDF below', null, null],
          ].map(([n, text, link, href]) => (
            <div key={n} className="mfc-step">
              <div className="mfc-step-num">{n}</div>
              <div className="mfc-step-text">
                {text}{' '}
                {link && <a href={href} target="_blank" rel="noopener noreferrer">{link}</a>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`mfc-drop-zone${dragOver ? ' drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
      >
        <div className="mfc-drop-icon">📄</div>
        <div className="mfc-drop-label">Drop your MF Central CAS PDF here</div>
        <div className="mfc-drop-sub">or click to browse · PDF only · max 20MB</div>
        <input
          ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
      </div>

      <div className="mfc-privacy-note">
        🔒 Your PDF is processed server-side and never stored. Data is discarded after parsing.
      </div>
    </div>
  );

  // ── Parsing spinner ────────────────────────────────────────────────────────
  const ParsingState = () => (
    <div className="mfc-page mfc-center">
      <div className="mfc-spinner" />
      <div className="mfc-parsing-label">Reading your MF Central statement…</div>
      <div className="mfc-parsing-sub">Fetching live NAVs from AMFI · Please wait</div>
    </div>
  );

  // ── Error ──────────────────────────────────────────────────────────────────
  const ErrorState = () => (
    <div className="mfc-page mfc-center">
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
      <div className="mfc-error-msg">{errMsg}</div>
      <button className="btn-primary" onClick={reset} style={{ marginTop: 20 }}>Try Again</button>
    </div>
  );

  // ── Result ─────────────────────────────────────────────────────────────────
  const ResultView = () => {
    if (!result) return null;
    const { pan, name, period, consolidated, summary } = result;
    const holdings = consolidated || [];

    // Sort by value descending
    const sorted = [...holdings].sort((a, b) => (b.value_live || 0) - (a.value_live || 0));
    const totalVal = summary?.total_value || 0;

    return (
      <div className="mfc-page">
        {/* Hero summary */}
        <div className="mfc-hero-card">
          <div className="mfc-investor-info">
            <div className="mfc-investor-name">{name || 'Investor'}</div>
            <div className="mfc-investor-meta">PAN: {pan} · {period?.from} → {period?.to}</div>
          </div>
          <div className="mfc-summary-grid">
            <div className="mfc-summary-stat">
              <div className="mfc-stat-val">{fmtRs(totalVal)}</div>
              <div className="mfc-stat-label">Current Value</div>
            </div>
            <div className="mfc-summary-stat">
              <div className="mfc-stat-val">{summary?.total_holdings}</div>
              <div className="mfc-stat-label">Schemes</div>
            </div>
            <div className="mfc-summary-stat">
              <div className="mfc-stat-val">{summary?.total_folios}</div>
              <div className="mfc-stat-label">Folios</div>
            </div>
          </div>
        </div>

        {/* Holdings table */}
        <div className="section" style={{ marginTop: 24 }}>
          <div className="section-head">
            <div className="section-title">📋 Holdings — Live NAV</div>
            <div className="section-badge">AMFI LIVE · {summary?.total_holdings} SCHEMES</div>
          </div>
          <div className="table-card">
            <div className="table-wrap">
              <table className="idx-table mfc-table">
                <thead>
                  <tr>
                    <th>Scheme</th>
                    <th>ISIN</th>
                    <th>Units</th>
                    <th>Live NAV</th>
                    <th>Current Value</th>
                    <th>% of Portfolio</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((h, i) => {
                    const share = totalVal > 0 ? ((h.value_live / totalVal) * 100).toFixed(1) : 0;
                    return (
                      <tr key={`${h.isin}-${i}`}>
                        <td>
                          <div className="idx-name-cell">
                            <span>{h.amfi_name || h.scheme_name}</span>
                            {h.folios?.length > 1 && (
                              <span className="cat-pill cat-equity">{h.folios.length} folios</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '.68rem' }}>
                            {h.isin}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmtUnits(h.units)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          ₹{fmt(h.nav_live)}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                          {fmtRs(h.value_live)}
                        </td>
                        <td>
                          <div className="mfc-bar-wrap">
                            <div className="mfc-share-bar" style={{ width: `${share}%` }} />
                            <span className="mfc-share-label">{share}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <button className="mfc-reset-btn" onClick={reset}>↩ Upload Another Statement</button>

        <div className="mfc-disclaimer">
          Live NAVs sourced from AMFI. Holdings data from your MF Central statement dated {period?.to}.
          Past performance is not indicative of future returns. Not investment advice.
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="container">
        <Navbar activePage="portfolio" />
        {stage === 'upload' && <UploadZone />}
        {stage === 'parsing' && <ParsingState />}
        {stage === 'error' && <ErrorState />}
        {stage === 'result' && <ResultView />}
      </div>
      <Footer />
    </>
  );
}
