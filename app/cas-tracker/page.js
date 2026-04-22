'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const CACHE_PREFIX = 'cas_parse_v2_';

function getFileKey(file) {
  return CACHE_PREFIX + [file.name, file.size, file.lastModified].join('|');
}

function readCache(file) {
  if (typeof window === 'undefined') return null;
  try {
    const cached = sessionStorage.getItem(getFileKey(file));
    return cached ? JSON.parse(cached) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(file, data) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(getFileKey(file), JSON.stringify(data));
  } catch (e) {}
}

function isPanLike(str) {
  return PAN_REGEX.test(str);
}

function fmtINR(val) {
  if (val < 0) return fmtINR(Math.abs(val));
  if (val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr';
  if (val >= 100000) return (val / 100000).toFixed(2) + ' L';
  if (val >= 1000) return (val / 1000).toFixed(2) + ' K';
  return val.toFixed(2);
}

function fmtDec(val, decimals = 4) {
  return val.toFixed(decimals);
}

// FIFO cost basis calculation
function calculateFifoCost(scheme, currentNav) {
  const units = parseFloat(scheme.close) || 0;
  if (units === 0) return { invested: 0, lockedValue: 0 };

  const directCost = parseFloat(scheme.valuation?.cost || scheme.cost || 0);
  let buyLots = [];
  let lockedUnits = 0;
  
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const isELSS = /ELSS|TAX.?SAVER/i.test(scheme.scheme);

  (scheme.transactions || []).forEach(txn => {
    const type = (txn.type || '').toUpperCase();
    const txnUnits = parseFloat(txn.units) || 0;
    const amount = parseFloat(txn.amount) || 0;
    if (txnUnits === 0) return;

    if (/PURCHASE|SIP|SWITCH.?IN|REINVEST/.test(type)) {
      buyLots.push({
        units: txnUnits,
        amount: amount,
        nav: amount / txnUnits,
        date: new Date(txn.date)
      });
    } else if (/REDEMPTION|SWITCH.?OUT/.test(type)) {
      let rem = Math.abs(txnUnits);
      while (rem > 0 && buyLots.length > 0) {
        if (buyLots[0].units <= rem) {
          rem -= buyLots[0].units;
          buyLots.shift();
        } else {
          buyLots[0].units -= rem;
          buyLots[0].amount = buyLots[0].units * buyLots[0].nav;
          rem = 0;
        }
      }
    }
  });

  let fifoInvested = 0;
  buyLots.forEach(lot => {
    fifoInvested += lot.amount;
    if (isELSS && lot.date > threeYearsAgo) {
      lockedUnits += lot.units;
    }
  });

  let finalInvested = fifoInvested;
  if (directCost > 0 && (fifoInvested === 0 || fifoInvested < directCost * 0.5)) {
    finalInvested = directCost;
  }

  return {
    invested: Math.max(0, finalInvested),
    lockedValue: lockedUnits * currentNav
  };
}

function CasTrackerInner() {
  const [uploadState, setUploadState] = useState('idle'); // idle, loading, error, success
  const [loadingText, setLoadingText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [portfolioDataByPan, setPortfolioDataByPan] = useState({});
  const [activePan, setActivePan] = useState('');
  const [fromCache, setFromCache] = useState(false);

  // ── Auth + saved portfolios ──
  const { data: session, status: authStatus } = useSession();
  const isSignedIn = authStatus === 'authenticated' && !!session;
  const isAdmin    = session?.user?.role === 'admin';
  const searchParams = useSearchParams();
  const [savedPortfolios, setSavedPortfolios] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState(''); // '', 'saving', 'saved', 'error'

  // Auto-load a portfolio passed via ?load=blobKey (admin viewing another user's data)
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const loadKey = searchParams.get('load');
    if (!loadKey || !isAdmin) return;
    // Small delay so processCasData has the session in scope
    const t = setTimeout(() => loadSavedPortfolio(loadKey), 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, isAdmin]);

  // Fetch saved portfolios when signed in
  useEffect(() => {
    if (!isSignedIn) return;
    setLoadingSaved(true);
    fetch('/api/cas/list')
      .then(r => r.json())
      .then(d => setSavedPortfolios(d.portfolios || []))
      .catch(() => {})
      .finally(() => setLoadingSaved(false));
  }, [isSignedIn]);

  async function processCasData(data, cached) {
    const portfolioData = {};
    const panInvestorMap = data.pan_investor_map || {};
    
    // Global investor name from casparser (safe for single-PAN CAS)
    const globalName = (data.investor_info?.name || '').trim();

    // Collect all PANs that casparser assigned
    const allPans = {};
    (data.folios || []).forEach(folio => {
      const fp = (folio.PAN || '').toUpperCase().trim();
      if (fp && fp.length === 10 && PAN_REGEX.test(fp)) {
        allPans[fp] = true;
      }
    });

    const panList = Object.keys(allPans);
    const isSinglePan = panList.length <= 1;

    (data.folios || []).forEach(folio => {
      let rawPan = (folio.PAN || '').toUpperCase().trim();
      if (!rawPan || rawPan.length !== 10 || !PAN_REGEX.test(rawPan)) {
        rawPan = 'UNKNOWN';
      }

      // Investor name resolution
      let investorName = panInvestorMap[rawPan] || '';

      // For single-PAN CAS, global investor_info.name is always safe
      if (!investorName && isSinglePan && globalName && !isPanLike(globalName)) {
        investorName = globalName;
      }

      // For multi-PAN: try global name for the first PAN only
      if (!investorName && !isSinglePan && globalName && !isPanLike(globalName)) {
        if (panList.length > 0 && rawPan === panList[0]) {
          investorName = globalName;
        }
      }

      // Last resort: never show PAN, show a human label instead
      if (!investorName || isPanLike(investorName)) {
        if (rawPan !== 'UNKNOWN') {
          investorName = `Investor (${rawPan.substring(0, 5)}****${rawPan.substring(9)})`;
        } else {
          investorName = 'Unknown Investor';
        }
      }

      if (!portfolioData[rawPan]) {
        portfolioData[rawPan] = {
          current: 0,
          invested: 0,
          holdings: [],
          investorName: investorName
        };
      }

      (folio.schemes || []).forEach(scheme => {
        const units = parseFloat(scheme.close) || 0;
        if (units < 0.001) return;

        // Nominee from casparser's scheme.nominees array
        let nomineeStr = 'Not Specified';
        if (scheme.nominees && scheme.nominees.length > 0) {
          nomineeStr = scheme.nominees.join(', ');
        }

        // Advisor from casparser's scheme.advisor
        const advisorStr = scheme.advisor || 'Direct / N/A';

        portfolioData[rawPan].holdings.push({
          scheme: scheme,
          folio: folio.folio,
          units: units,
          nominee: nomineeStr,
          advisor: advisorStr,
          liveNav: parseFloat(scheme.valuation?.nav || 0),
          isLive: false,
          value: 0,
          invested: 0,
          avgPurchaseNav: 0,
          isELSS: /ELSS|TAX.?SAVER/i.test(scheme.scheme),
          lockedValue: 0,
          name: scheme.scheme
        });
      });
    });

    // Fetch live NAVs and compute metrics
    const allHoldings = [];
    Object.keys(portfolioData).forEach(pan => {
      portfolioData[pan].holdings.forEach(h => {
        allHoldings.push({ pan, h });
      });
    });

    setLoadingText('Fetching live NAVs…');

    // 1. Collect unique AMFI codes — same fund can appear in multiple folios,
    //    no point fetching the same code more than once.
    const uniqueAmfi = [...new Set(
      allHoldings.map(({ h }) => h.scheme.amfi).filter(Boolean)
    )];

    // 2. Fetch all unique NAVs concurrently. allSettled so one failure
    //    doesn't abort the rest. Build amfiCode → nav lookup map.
    const navMap = {};
    await Promise.allSettled(
      uniqueAmfi.map(async (amfi) => {
        try {
          const navRes = await fetch(`/api/mf?code=${amfi}&latest=1`);
          if (navRes.ok) {
            const resJson = await navRes.json();
            if (resJson.status === 'SUCCESS' && resJson.data?.length > 0) {
              navMap[amfi] = parseFloat(resJson.data[0].nav);
            }
          }
        } catch {
          // Non-fatal — holdings for this fund will use CAS-reported NAV
        }
      })
    );

    // 3. Apply resolved NAVs and compute metrics for every holding.
    for (const { h, pan } of allHoldings) {
      const scheme = h.scheme;
      if (scheme.amfi && navMap[scheme.amfi] !== undefined) {
        h.liveNav = navMap[scheme.amfi];
        h.isLive  = true;
      }
      const currentNav = h.liveNav;
      const fifo = calculateFifoCost(scheme, currentNav);
      h.value       = h.units * currentNav;
      h.invested    = fifo.invested;
      h.lockedValue = fifo.lockedValue;
      const casCost = parseFloat(scheme.valuation?.cost || 0);
      h.avgPurchaseNav = h.units > 0 && casCost > 0 ? casCost / h.units : 0;
      portfolioData[pan].current  += h.value;
      portfolioData[pan].invested += h.invested;
      delete h.scheme;
    }

    // Sort by value desc
    Object.keys(portfolioData).forEach(pan => {
      portfolioData[pan].holdings.sort((a, b) => b.value - a.value);
    });

    const pans = Object.keys(portfolioData);
    if (pans.length === 0) {
      throw new Error('No active holdings found in this statement.');
    }

    setPortfolioDataByPan(portfolioData);
    setActivePan(pans[0]);
    setFromCache(cached);
    setUploadState('success');
  }

  async function saveToBlobIfSignedIn(data, fileName, panCount) {
    if (!isSignedIn) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/cas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedData: data, fileName, panCount }),
      });
      if (res.ok) {
        const saved = await res.json();
        setSavedPortfolios(prev => [
          { id: saved.id, file_name: fileName, pan_count: panCount, uploaded_at: saved.uploadedAt, blob_key: saved.blobKey },
          ...prev,
        ]);
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setUploadState('loading');
    setErrorText('');

    const formData = new FormData(e.target);
    const pdfFile = formData.get('pdf-file');
    const password = formData.get('pdf-password');

    try {
      let data = null;
      let cached = false;
      
      const cachedData = readCache(pdfFile);
      if (cachedData) {
        data = cachedData;
        cached = true;
        setLoadingText('Loading from cache…');
      } else {
        setLoadingText('Decrypting & Parsing…');
        const uploadFormData = new FormData();
        uploadFormData.append('file', pdfFile);
        uploadFormData.append('password', password);

        const parseRes = await fetch('/api/parse', {
          method: 'POST',
          body: uploadFormData
        });

        if (!parseRes.ok) {
          throw new Error(
            parseRes.status === 401
              ? 'Incorrect password. Try your PAN in ALL CAPS.'
              : 'Failed to decrypt or parse the statement.'
          );
        }

        data = await parseRes.json();
        writeCache(pdfFile, data);
        // Auto-save to Vercel Blob (fire-and-forget, non-blocking)
        const panCount = (data.folios || []).reduce((acc, f) => {
          const pan = (f.PAN || '').toUpperCase().trim();
          return pan && pan.length === 10 ? acc.add(pan) : acc;
        }, new Set()).size;
        saveToBlobIfSignedIn(data, pdfFile.name, panCount);
      }

      await processCasData(data, cached);
    } catch (err) {
      setErrorText(err.message);
      setUploadState('error');
    }
  }

  function handleNewUpload() {
    setUploadState('idle');
    setPortfolioDataByPan({});
    setActivePan('');
    setFromCache(false);
    setSaveStatus('');
  }

  async function loadSavedPortfolio(blobKey) {
    setUploadState('loading');
    setLoadingText('Loading saved portfolio…');
    try {
      // Fetch blob via a signed-read proxy
      const res = await fetch(`/api/cas/load?key=${encodeURIComponent(blobKey)}`);
      if (!res.ok) throw new Error('Could not load saved portfolio.');
      const data = await res.json();
      await processCasData(data, false);
    } catch (err) {
      setErrorText(err.message);
      setUploadState('error');
    }
  }

  const panKeys = Object.keys(portfolioDataByPan);
  const currentInfo = portfolioDataByPan[activePan] || { current: 0, invested: 0, holdings: [], investorName: '' };
  const gain = currentInfo.current - currentInfo.invested;
  const gainPct = currentInfo.invested > 0 ? ((gain / currentInfo.invested) * 100).toFixed(2) : '0.00';
  const isProfit = gain >= 0;

  return (
    <>
      <div className="container">
        <Navbar activePage="cas-tracker" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"></div>
            <span className="eyebrow-text">CAS Portfolio Tracker</span>
          </div>
          <h1 className="page-title">
            Live <span>NAV</span> & FIFO Wealth Tracker
          </h1>
          <p className="page-subtitle">
            Securely parse your CAMS or KFintech CAS. Multi-PAN family support · ELSS lock-in tracking · FIFO capital gains
          </p>
        </div>

        {uploadState === 'idle' && (
          <section id="upload-section">
            {/* Unauthenticated: show sign-in prompt. Page remains public and crawlable. */}
            {authStatus === 'unauthenticated' && (
              <div className="upload-card" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
                <div style={{ fontSize: '2.2rem', marginBottom: 16 }}>🔐</div>
                <h2 style={{
                  fontSize: '1.1rem', fontWeight: 800, color: 'var(--g1)',
                  letterSpacing: '-.3px', marginBottom: 8,
                }}>
                  Sign in to use the CAS Tracker
                </h2>
                <p style={{
                  fontSize: '.8rem', color: 'var(--muted)',
                  lineHeight: 1.7, margin: '0 auto 24px', maxWidth: 360,
                }}>
                  Securely parse your CAMS or KFintech CAS PDF. Processed privately
                  and saved to your account for future access.
                </p>
                <a
                  href="/login?from=/cas-tracker"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    padding: '12px 28px', borderRadius: 10,
                    background: 'var(--g1)', color: '#fff',
                    fontWeight: 700, fontSize: '.85rem', textDecoration: 'none',
                    fontFamily: 'Raleway, sans-serif',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--g2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                    <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                  Sign in with Google
                </a>
                <div style={{
                  marginTop: 28, padding: '16px 20px',
                  background: 'var(--s2)', borderRadius: 10,
                  border: '1px solid var(--border)', textAlign: 'left',
                }}>
                  <div style={{
                    fontSize: '.6rem', fontWeight: 800, letterSpacing: '1.5px',
                    textTransform: 'uppercase', color: 'var(--muted)',
                    fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
                  }}>
                    What you get
                  </div>
                  {['📊 Live NAV tracking across all holdings',
                    '📁 Cloud-saved CAS — no re-upload needed',
                    '🔒 FIFO capital gains & ELSS lock-in analysis',
                    '👨‍👩‍👧 Multi-PAN family CAS support'].map((feat, i, arr) => (
                    <div key={i} style={{
                      fontSize: '.75rem', color: 'var(--text2)',
                      padding: '5px 0', fontWeight: 600,
                      borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      {feat}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Authenticated (or loading): show upload form */}
            {authStatus !== 'unauthenticated' && (
            <form id="cas-form" className="upload-card" onSubmit={handleSubmit}>
              <div style={{ marginBottom: '18px' }}>
                <div className="field-label">CAS PDF File</div>
                <input
                  type="file"
                  name="pdf-file"
                  id="pdf-file"
                  accept=".pdf"
                  required
                  className="file-input"
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <div className="field-label">PAN Password (ALL CAPS)</div>
                <input
                  type="password"
                  name="pdf-password"
                  id="pdf-password"
                  placeholder="ABCDE1234F"
                  required
                  className="field-input"
                />
              </div>

              <button type="submit" className="submit-btn">
                <span>🔓</span>
                <span>Parse & Track</span>
              </button>

              <div className="security-note">
                {isSignedIn
                  ? saveStatus === 'saving' ? '☁ Saving to your account…'
                  : saveStatus === 'saved'  ? '✅ Saved to your account'
                  : saveStatus === 'error'  ? '⚠ Could not save (will retry)'
                  : '☁ Uploads saved to your account automatically'
                  : '🔒 100% Local Processing · No Data Stored · Sign in to save'}
              </div>
            </form>
            )} {/* end authenticated form */}

            {/* Saved portfolios */}
            {isSignedIn && (savedPortfolios.length > 0 || loadingSaved) && (
              <div style={{ marginTop: 24, maxWidth: 520, margin: '24px auto 0' }}>
                <div style={{
                  fontSize: '.62rem', fontWeight: 800, letterSpacing: '1.5px',
                  textTransform: 'uppercase', color: 'var(--muted)',
                  fontFamily: "'JetBrains Mono', monospace",
                  marginBottom: 10,
                }}>
                  📁 Your Saved Portfolios
                </div>
                {loadingSaved ? (
                  <div className="sk" style={{ height: 44, borderRadius: 10 }} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {savedPortfolios.map(p => (
                      <button
                        key={p.id}
                        onClick={() => loadSavedPortfolio(p.blob_key)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', borderRadius: 10,
                          border: '1.5px solid var(--border)', background: 'var(--s2)',
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                          transition: 'border-color .15s, background .15s',
                          fontFamily: 'Raleway, sans-serif',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--s3)'; e.currentTarget.style.borderColor = 'var(--border2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--s2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                      >
                        <div>
                          <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                            📄 {p.file_name}
                          </div>
                          <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                            {p.pan_count} PAN{p.pan_count !== 1 ? 's' : ''} · {new Date(p.uploaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                        <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--g2)', flexShrink: 0, marginLeft: 8 }}>
                          Load →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {uploadState === 'loading' && (
          <div className="upload-card">
            <div className="loading-box">
              <div className="spinner"></div>
              <div className="loading-text">{loadingText}</div>
              <div className="loading-sub">This may take a moment for large statements</div>
            </div>
          </div>
        )}

        {uploadState === 'error' && (
          <div className="upload-card">
            <div className="error-box">{errorText}</div>
            <button onClick={handleNewUpload} className="submit-btn" style={{ marginTop: '16px' }}>
              Try Again
            </button>
          </div>
        )}

        {uploadState === 'success' && (
          <section id="dashboard-section">
            <div className="dash-header">
              <div>
                <h2 className="dash-title">
                  {currentInfo.investorName}'s Portfolio
                  {fromCache && <span className="cache-badge">⚡ Cached</span>}
                </h2>
                <p className="dash-sub">Computed using FIFO accounting · Live NAVs from AMFI</p>
              </div>
              <button onClick={handleNewUpload} className="new-upload-btn">
                ↑ New Upload
              </button>
            </div>

            {panKeys.length > 1 && (
              <div className="pan-tabs">
                {panKeys.map(pan => {
                  const info = portfolioDataByPan[pan];
                  const firstName = info.investorName.split(' ')[0];
                  return (
                    <button
                      key={pan}
                      onClick={() => setActivePan(pan)}
                      className={`pan-tab ${pan === activePan ? 'active' : ''}`}
                    >
                      <span className="pan-code">{pan}</span>
                      <span>{firstName}'s Portfolio</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="stat-grid animate-stagger">
              <div className="stat-card">
                <div className="sc-label">Current Value</div>
                <div className="sc-val">₹{fmtINR(currentInfo.current)}</div>
              </div>

              <div className="stat-card">
                <div className="sc-label">Total Invested</div>
                <div className="sc-val" style={{ color: 'var(--text2)' }}>₹{fmtINR(currentInfo.invested)}</div>
              </div>

              <div className="stat-card gain-card">
                <div className={`gain-accent ${isProfit ? 'pos' : 'neg'}`}></div>
                <div className="sc-label">Wealth Gain</div>
                <div className="gain-row">
                  <div className={`sc-val${isProfit ? '' : ' neg'}`} style={{ fontSize: '1.5rem' }}>
                    {isProfit ? '+' : ''}₹{fmtINR(gain)}
                  </div>
                  <div className={`gain-pct ${isProfit ? 'pos' : 'neg'}`}>
                    {isProfit ? '+' : ''}{gainPct}%
                  </div>
                </div>
              </div>
            </div>

            <div className="fund-grid animate-stagger">
              {currentInfo.holdings.map((fund, idx) => {
                const fGain = fund.value - fund.invested;
                const fGainPct = fund.invested > 0 ? ((fGain / fund.invested) * 100).toFixed(1) : '0.0';
                const fProfit = fGain >= 0;
                const avgNavDisplay = fund.avgPurchaseNav > 0 ? `₹${fmtDec(fund.avgPurchaseNav, 2)}` : '—';

                return (
                  <div key={idx} className="fund-card">
                    <div>
                      <div className="fund-name">{fund.name}</div>
                      
                      <div className="folio-meta">
                        <div className="folio-row">
                          <div>
                            <span className="label">Folio</span><br />
                            <span className="value">{fund.folio || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="label">Nominee</span><br />
                            <span className="value">{fund.nominee}</span>
                          </div>
                          <div className="folio-full">
                            <span className="label">Advisor</span><br />
                            <span className="value">{fund.advisor}</span>
                          </div>
                        </div>
                      </div>

                      {fund.isELSS && (
                        fund.lockedValue > 0 ? (
                          <div className="elss-badge elss-locked">
                            🔒 ₹{fmtINR(fund.lockedValue)} Locked
                          </div>
                        ) : (
                          <div className="elss-badge elss-unlocked">
                            🔓 ELSS Unlocked
                          </div>
                        )
                      )}
                    </div>

                    <div className="nav-grid">
                      <div className="nav-left">
                        <div className="nav-item">
                          <div className="ni-label">
                            Avg Buy NAV <span className="cas-tag">(CAS)</span>
                          </div>
                          <div className="ni-val">{avgNavDisplay}</div>
                        </div>
                        
                        <div className="nav-item">
                          <div className="ni-label">
                            Live NAV {fund.isLive && <span className="live-indicator"></span>}
                          </div>
                          <div className="ni-val">₹{fmtDec(fund.liveNav)}</div>
                        </div>
                        
                        <div className="nav-item">
                          <div className="ni-label">Units</div>
                          <div className="ni-val sm">{fmtDec(fund.units)}</div>
                        </div>
                        
                        <div className="nav-item">
                          <div className="ni-label">Invested</div>
                          <div className="ni-val sm">₹{fmtINR(fund.invested)}</div>
                        </div>
                      </div>

                      <div className="nav-right-col">
                        <div className="ni-label">Current Value</div>
                        <div className="ni-val">₹{fmtINR(fund.value)}</div>
                        <div className={`fund-gain-pct ${fProfit ? 'pos' : 'neg'}`}>
                          {fProfit ? '+' : ''}{fGainPct}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <Footer />
    </>
  );
}

export default function CasTrackerPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sk" style={{ width: 140, height: 16, borderRadius: 8 }} />
      </div>
    }>
      <CasTrackerInner />
    </Suspense>
  );
}
