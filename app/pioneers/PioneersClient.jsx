'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import './pioneers.css';

const ERAS = [
  {
    id: 'era-uti',
    badge: '1964 – 1987',
    title: 'The UTI Monopoly Era',
    desc: 'Government monopoly under Unit Trust of India. Birth of US-64 and India’s first equity fund, UTI Mastershare (1986).',
    milestone: '🏛️ 1986: UTI Mastershare launched',
    filterVal: 'psu',
  },
  {
    id: 'era-psu',
    badge: '1987 – 1993',
    title: 'The Public Sector Wave',
    desc: 'SBI, Canbank, and LIC mutual funds introduced. First wave of institutional expansion across India.',
    milestone: '🏦 1987: SBI MF & Canara Robeco',
    filterVal: 'psu',
  },
  {
    id: 'era-private',
    badge: '1993 – 1996',
    title: 'The Private Sector Dawn',
    desc: 'SEBI MF Regulations 1993. Kothari Pioneer, Reliance, and HDFC launch India’s greatest multi-baggers.',
    milestone: '🚀 1993: Franklin (Kothari) Bluechip',
    filterVal: 'private',
  },
  {
    id: 'era-growth',
    badge: '1996 – 2008',
    title: 'Demat & Bull Run Test',
    desc: 'Physical paper certificates replaced by NSDL/CDSL demat. Schemes survive the 2000 Dot-com and 2008 GFC.',
    milestone: '📈 Demat accounts revolution',
    filterVal: 'silver',
  },
  {
    id: 'era-reform',
    badge: '2008 – 2018',
    title: 'Direct Plans & SEBI Categorization',
    desc: 'Entry loads banned (2009), Direct Plans mandated (2013), and SEBI 2018 Categorization streamlines schemes.',
    milestone: '🎯 Zero entry load & Direct plans',
    filterVal: 'all',
  },
  {
    id: 'era-sip',
    badge: '2018 – 2026',
    title: 'The Retail SIP Supercycle',
    desc: 'Monthly SIP flows cross ₹25,000+ Crore as retail investors become the dominant force in Indian equities.',
    milestone: '💎 ₹25,000+ Cr monthly SIPs',
    filterVal: 'all',
  },
];

const SPOTLIGHTS = [
  {
    tag: '👑 Highest Wealth Multiplier',
    title: 'Nippon India Growth Mid Cap Fund (Reliance Growth)',
    desc: 'Launched in October 1995 at ₹10.00 par value, this fund delivered an astonishing 21.94% CAGR over 30.9 years. A ₹10,000 investment at NFO has grown into an unbelievable ₹45.75 Lakhs today.',
    launch: '05-Oct-1995',
    cagr: '21.94%',
    multiplier: '457.5x',
    nav: '₹4,575.45',
    code: '100377',
  },
  {
    tag: '🌟 The 3-Decade Flexi Cap Titan',
    title: 'HDFC Flexi Cap Fund (HDFC Equity Fund)',
    desc: 'Allotted in December 1994 (Centurion/HDFC Equity), this flagship fund compounded through Asian Financial Crisis, Dot-Com Bust, 2008 GFC, and Covid at 18.35% CAGR, turning ₹10,000 into ₹20.82 Lakhs.',
    launch: '17-Dec-1994',
    cagr: '18.35%',
    multiplier: '208.2x',
    nav: '₹2,082.61',
    code: '101762',
  },
  {
    tag: '🥇 The First Private Equity Fund',
    title: 'Franklin India Bluechip Fund (Kothari Pioneer)',
    desc: 'When SEBI opened the doors to private sector funds in 1993, Kothari Pioneer Bluechip was India’s first open-ended private equity scheme. Over 32.7 years, it compounded at 15.23% CAGR to cross ₹1,035 NAV.',
    launch: '01-Dec-1993',
    cagr: '15.23%',
    multiplier: '103.5x',
    nav: '₹1,035.70',
    code: '100471',
  },
  {
    tag: '⚖️ The Hybrid Wealth Pioneer',
    title: 'Aditya Birla Sun Life Equity Hybrid \'95 Fund',
    desc: 'Proving that balanced equity-debt allocation creates generational wealth with lower volatility, this fund compounded at 17.39% CAGR over 31.5 years, growing ₹10 into ₹1,568.46.',
    launch: '11-Feb-1995',
    cagr: '17.39%',
    multiplier: '156.8x',
    nav: '₹1,568.46',
    code: '103155',
  },
  {
    tag: '🏛️ The Founding Father (1986)',
    title: 'UTI Mastershare Unit Scheme (Large Cap)',
    desc: 'India’s very first equity mutual fund scheme launched by UTI in 1986. Over nearly 40 continuous years, it weathered every political and financial cycle in independent India’s modern history.',
    launch: '15-Oct-1986',
    cagr: '8.60%',
    multiplier: '26.8x',
    nav: '₹268.03',
    code: '100651',
  },
  {
    tag: '🎯 The Mid-Cap Pioneer',
    title: 'Franklin India Prima Fund (Kothari Pioneer Prima)',
    desc: 'India’s first dedicated mid-cap fund launched in 1993/1994. It pioneered bottom-up stock picking in emerging Indian companies, compounding at 17.29% CAGR to reach an extraordinary ₹1,619 NAV.',
    launch: '29-Sep-1994',
    cagr: '17.29%',
    multiplier: '161.9x',
    nav: '₹1,619.43',
    code: '100520',
  },
];

const FAQS = [
  {
    q: 'What is the oldest mutual fund in India that is still active today?',
    a: (
      <>
        The oldest surviving mutual fund scheme in India is{' '}
        <Link href="/fund/100651" className="pnr-link">
          UTI Mastershare Unit Scheme (UTI Large Cap Fund)
        </Link>
        , which was launched on October 15, 1986 by Unit Trust of India. It has been operating continuously for nearly 40 years. (The older US-64 scheme launched in 1964 was discontinued in 2002).
      </>
    ),
  },
  {
    q: 'Which mutual fund scheme has given the highest returns since inception in India?',
    a: (
      <>
        <Link href="/fund/100377" className="pnr-link">
          Nippon India Growth Mid Cap Fund
        </Link>{' '}
        (formerly Reliance Growth Fund, launched on October 5, 1995) holds the record for the highest compounded wealth creation among 30+ year veteran schemes, delivering a 21.94% CAGR over 30.9 years. Its NAV grew from ₹10.00 at NFO to over ₹4,575.00 today (a 457x wealth multiplier).
      </>
    ),
  },
  {
    q: 'What was the first private-sector mutual fund launched in India?',
    a: (
      <>
        The first private-sector mutual fund in India was Kothari Pioneer Mutual Fund (a joint venture between Chennai’s Kothari Group and Pioneer Group, USA, later acquired by Franklin Templeton in 2002). Its flagship funds—
        <Link href="/fund/100471" className="pnr-link">
          Franklin India Large Cap (Bluechip) Fund
        </Link>{' '}
        and{' '}
        <Link href="/fund/100520" className="pnr-link">
          Franklin India Prima (Flexi Cap) Fund
        </Link>
        —were launched on December 1, 1993.
      </>
    ),
  },
  {
    q: 'What happened to US-64 and the original Unit Trust of India (UTI)?',
    a: 'Unit Scheme 1964 (US-64) was India’s first scheme in 1964 under a statutory government monopoly. Following the 2001–2002 UTI restructuring, US-64 was bifurcated into SUUTI (Special Undertaking of UTI) and UTI Mutual Fund, leaving UTI Mastershare (1986) as the oldest continuous open-ended scheme.',
  },
  {
    q: 'If I had invested ₹10,000 in India’s top mutual funds in 1995, what would it be worth in 2026?',
    a: (
      <>
        ₹10,000 invested at NFO in Nippon India Growth Fund grew to ₹45.75 Lakhs (21.94% CAGR); in{' '}
        <Link href="/fund/101762" className="pnr-link">
          HDFC Flexi Cap Fund
        </Link>{' '}
        grew to ₹20.82 Lakhs (18.35% CAGR); in{' '}
        <Link href="/fund/103155" className="pnr-link">
          ABSL Equity Hybrid &apos;95 Fund
        </Link>{' '}
        grew to ₹15.68 Lakhs (17.39% CAGR); compared to ~₹2.1 Lakhs in Gold and ~₹1.0 Lakh in Fixed Deposits.
      </>
    ),
  },
  {
    q: 'Have any Indian equity mutual funds ever delivered negative returns over a 20-year holding period?',
    a: 'No. Historically in India, no diversified equity mutual fund held continuously for 20 years has ever delivered a negative return or trailed inflation. Over 20-year horizons, equity mutual fund returns have consistently stayed between 11% and 22% annualised CAGR.',
  },
  {
    q: 'Are older mutual funds (30+ years) safer or better to invest in than new NFOs?',
    a: 'Older funds offer the distinct advantage of a proven 30-year track record navigating multiple extreme market cycles (1997 Asian crisis, 2000 tech crash, 2008 GFC, 2020 Covid), whereas NFOs have no verifiable track record.',
  },
  {
    q: 'How did mutual funds calculate and publish NAVs before the 2006 electronic system?',
    a: 'Prior to AMFI’s central digital portal launch in April 2006, mutual fund NAVs were published daily in major financial newspapers like The Economic Times and Business Standard. Investors held physical paper unit certificates (similar to share certificates) until the demat and registrar digital revolution simplified electronic tracking.',
  },
  {
    q: 'How does a 30-year SIP return compare against a 30-year lumpsum in Indian funds?',
    a: 'A ₹5,000 monthly SIP over 30 years (₹18 Lakhs total investment) compounded at 16% CAGR grew to ~₹3.8 Crore, proving that systematic disciplined investing delivers generational wealth without needing market timing.',
  },
  {
    q: 'Where can I track live portfolio holdings, rolling returns, and stress tests of these 30-year veteran schemes?',
    a: (
      <>
        On this platform, click on any fund name in the directory to view its dedicated analytics page, or analyze multi-period rolling return consistency directly on the{' '}
        <Link href="/rolling" className="pnr-link">
          Rolling Returns Calculator (https://mfcalc.getabundance.in/rolling)
        </Link>{' '}
        and filter live portfolios on the{' '}
        <Link href="/screener" className="pnr-link">
          Mutual Fund Screener (https://mfcalc.getabundance.in/screener)
        </Link>.
      </>
    ),
  },
];

export default function PioneersClient({ initialFunds = [] }) {
  const [search, setSearch] = useState('');
  const [eraFilter, setEraFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [sortBy, setSortBy] = useState('age');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Simulator State
  const [simType, setSimType] = useState('lumpsum');
  const [simLumpAmount, setSimLumpAmount] = useState(10000);
  const [simSipAmount, setSimSipAmount] = useState(5000);
  const [simSelectedCode, setSimSelectedCode] = useState('100377');
  const [openFaq, setOpenFaq] = useState(null);

  // Selected Fund for Simulator
  const selectedFund = useMemo(() => {
    return initialFunds.find((f) => String(f.code) === String(simSelectedCode)) || initialFunds[0] || {
      name: 'Nippon India Growth Mid Cap Fund',
      ret_inception: 21.94,
      age_years: 30.9,
      nav: 4575.45,
    };
  }, [initialFunds, simSelectedCode]);

  // Compute Simulator Results
  const simResults = useMemo(() => {
    const ageYrs = parseFloat(selectedFund.age_years) || 30.0;
    const cagr = (parseFloat(selectedFund.ret_inception) || 15.0) / 100;
    const goldCagr = 0.105;
    const fdCagr = 0.078;
    const infCagr = 0.065;

    if (simType === 'lumpsum') {
      const p = simLumpAmount;
      const fundCorpus = p * Math.pow(1 + cagr, ageYrs);
      const goldCorpus = p * Math.pow(1 + goldCagr, ageYrs);
      const fdCorpus = p * Math.pow(1 + fdCagr, ageYrs);
      const infCorpus = p * Math.pow(1 + infCagr, ageYrs);
      const multiplier = fundCorpus / p;

      return {
        principal: p,
        fundCorpus,
        goldCorpus,
        fdCorpus,
        infCorpus,
        multiplier,
        ageYrs,
      };
    } else {
      // SIP Future Value: FV = P * [ (1+i)^n - 1 ] / i * (1+i)
      const sip = simSipAmount;
      const n = ageYrs * 12;
      const totalInv = sip * n;

      const calcFv = (r) => {
        const i = Math.pow(1 + r, 1 / 12) - 1;
        return sip * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
      };

      const fundCorpus = calcFv(cagr);
      const goldCorpus = calcFv(goldCagr);
      const fdCorpus = calcFv(fdCagr);
      const infCorpus = calcFv(infCagr);
      const multiplier = fundCorpus / totalInv;

      return {
        principal: totalInv,
        fundCorpus,
        goldCorpus,
        fdCorpus,
        infCorpus,
        multiplier,
        ageYrs,
      };
    }
  }, [selectedFund, simType, simLumpAmount, simSipAmount]);

  // Filter and Sort Directory
  const filteredFunds = useMemo(() => {
    return initialFunds.filter((f) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = f.name?.toLowerCase().includes(q);
        const matchesAmc = f.amc?.toLowerCase().includes(q);
        const matchesCat = f.category?.toLowerCase().includes(q);
        if (!matchesName && !matchesAmc && !matchesCat) return false;
      }

      // Era
      const age = parseFloat(f.age_years) || 0;
      const incDate = String(f.inception_date || '');
      if (eraFilter === '30y' && age < 30.0) return false;
      if (eraFilter === 'silver' && (age < 25.0 || age >= 30.0)) return false;
      if (eraFilter === 'millennium' && (age < 20.0 || age >= 25.0)) return false;
      if (eraFilter === 'psu' && incDate > '1993-06-30') return false;
      if (eraFilter === 'private' && (incDate < '1993-07-01' || incDate > '1996-12-31')) return false;

      // Category
      if (catFilter !== 'all') {
        const cat = (f.category || '').toLowerCase();
        if (catFilter === 'flexi' && !cat.includes('flexi') && !cat.includes('multi cap')) return false;
        if (catFilter === 'large' && (!cat.includes('large cap') || cat.includes('large & mid'))) return false;
        if (catFilter === 'mid' && !cat.includes('mid cap')) return false;
        if (catFilter === 'largemid' && !cat.includes('large & mid')) return false;
        if (catFilter === 'hybrid' && !cat.includes('hybrid') && !cat.includes('balanced')) return false;
        if (catFilter === 'elss' && !cat.includes('elss') && !cat.includes('tax')) return false;
      }

      return true;
    }).sort((a, b) => {
      let vA = 0;
      let vB = 0;
      if (sortBy === 'age') {
        vA = parseFloat(a.age_years) || 0;
        vB = parseFloat(b.age_years) || 0;
      } else if (sortBy === 'cagr') {
        vA = parseFloat(a.ret_inception) || 0;
        vB = parseFloat(b.ret_inception) || 0;
      } else if (sortBy === 'multiplier') {
        vA = (parseFloat(a.nav) || 10) / 10;
        vB = (parseFloat(b.nav) || 10) / 10;
      } else if (sortBy === '10y') {
        vA = parseFloat(a.ret_10y) || 0;
        vB = parseFloat(b.ret_10y) || 0;
      } else if (sortBy === 'nav') {
        vA = parseFloat(a.nav) || 0;
        vB = parseFloat(b.nav) || 0;
      }
      return sortDir === 'desc' ? vB - vA : vA - vB;
    });
  }, [initialFunds, search, eraFilter, catFilter, sortBy, sortDir]);

  // Reset to first page whenever filters or page size change
  useEffect(() => {
    setPage(0);
  }, [search, eraFilter, catFilter, sortBy, sortDir, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filteredFunds.length / pageSize));
  const from = filteredFunds.length ? page * pageSize + 1 : 0;
  const to = Math.min(filteredFunds.length, (page + 1) * pageSize);
  const visibleFunds = useMemo(() => {
    return filteredFunds.slice(page * pageSize, (page + 1) * pageSize);
  }, [filteredFunds, page, pageSize]);

  const fmtCurrency = (v) => {
    if (v == null || isNaN(v)) return '—';
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
    if (v >= 100000) return `₹${(v / 100000).toFixed(2)} Lakh`;
    return `₹${Math.round(v).toLocaleString('en-IN')}`;
  };

  const handleEraCardClick = (filterVal) => {
    setEraFilter(filterVal);
    const el = document.getElementById('directory-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="pnr-page">
      <div className="container">
        <Navbar />
      </div>

      {/* ── HERO BANNER ── */}
      <header className="pnr-hero">
        <div className="pnr-hero-inner">
          <div className="pnr-badge">
            <span className="pnr-badge-dot"></span>
            Hall of Fame · 30+ Years of Compounding
          </div>
          <h1 className="pnr-title">
            The <span>30-Year Club</span>: Pioneers of Indian Wealth Creation
          </h1>
          <p className="pnr-subtitle">
            Before UPI, demat accounts, and internet trading, a handful of visionary mutual funds set sail in Indian markets.
            Explore the untold history of India’s oldest surviving schemes and how ₹10,000 grew into multi-crore wealth.
          </p>

          {/* Top-Line KPIs */}
          <div className="pnr-kpis">
            <div className="pnr-kpi-card">
              <div className="pnr-kpi-val accent">39.9 Years</div>
              <div className="pnr-kpi-lbl">Oldest Active Fund</div>
              <div className="pnr-kpi-sub">UTI Mastershare (Oct 1986)</div>
            </div>
            <div className="pnr-kpi-card">
              <div className="pnr-kpi-val gold">29 Funds</div>
              <div className="pnr-kpi-lbl">The 30-Year Club</div>
              <div className="pnr-kpi-sub">Launched before Aug 1996</div>
            </div>
            <div className="pnr-kpi-card">
              <div className="pnr-kpi-val accent">457.5x</div>
              <div className="pnr-kpi-lbl">Max Wealth Multiplier</div>
              <div className="pnr-kpi-sub">Nippon India Growth (1995)</div>
            </div>
            <div className="pnr-kpi-card">
              <div className="pnr-kpi-val purple">15.8% CAGR</div>
              <div className="pnr-kpi-lbl">Average 30-Yr Equity CAGR</div>
              <div className="pnr-kpi-sub">vs 10.5% Gold · 8.0% FD</div>
            </div>
          </div>

          {/* ── Key Takeaways (Featured Snippet Optimized) ── */}
          <div className="pnr-takeaways-box">
            <div className="pnr-takeaways-header">
              <span className="pnr-takeaways-icon">💡</span>
              <h2 className="pnr-takeaways-title">Key Historical Takeaways & Compounding Facts</h2>
            </div>
            <div className="pnr-takeaways-grid">
              <div className="pnr-takeaway-item">
                <span className="pnr-takeaway-dot"></span>
                <span><strong>Oldest Surviving Fund:</strong> UTI Mastershare (launched 15-Oct-1986, running for nearly 40 continuous years).</span>
              </div>
              <div className="pnr-takeaway-item">
                <span className="pnr-takeaway-dot"></span>
                <span><strong>Highest Wealth Multiplier:</strong> Nippon India Growth Fund delivered a 457.5x return (21.94% CAGR since Oct 1995).</span>
              </div>
              <div className="pnr-takeaway-item">
                <span className="pnr-takeaway-dot"></span>
                <span><strong>Zero 15-Year Loss Probability:</strong> No diversified open-ended Indian equity scheme has ever lost money over a 15+ year holding period.</span>
              </div>
              <div className="pnr-takeaway-item">
                <span className="pnr-takeaway-dot"></span>
                <span><strong>Inflation Outperformance:</strong> Top equity pioneers generated 800 to 1,500 bps over CPI inflation (~6.5%) annually.</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="pnr-container">
        {/* ── SECTION 1: THE COMPOUNDING TIME MACHINE ── */}
        <section className="pnr-section">
          <div className="pnr-sec-header">
            <div className="pnr-sec-tag">Interactive Simulator</div>
            <h2 className="pnr-sec-title">The Compounding Time Machine</h2>
            <p className="pnr-sec-desc">
              Select an iconic fund and see how an investment made at inception compares against Gold, Fixed Deposits, and Inflation over decades.
            </p>
          </div>

          <div className="pnr-sim-box">
            <div className="pnr-type-toggles">
              <button
                className={`pnr-type-btn ${simType === 'lumpsum' ? 'active' : ''}`}
                onClick={() => setSimType('lumpsum')}
              >
                💰 One-Time Lumpsum at Inception
              </button>
              <button
                className={`pnr-type-btn ${simType === 'sip' ? 'active' : ''}`}
                onClick={() => setSimType('sip')}
              >
                📅 Monthly SIP from Day 1
              </button>
            </div>

            <div className="pnr-sim-controls">
              <div className="pnr-sim-field">
                <label>
                  <span>{simType === 'lumpsum' ? 'Initial Investment Amount' : 'Monthly SIP Amount'}</span>
                  <span className="val">{fmtCurrency(simType === 'lumpsum' ? simLumpAmount : simSipAmount)}</span>
                </label>
                {simType === 'lumpsum' ? (
                  <input
                    type="range"
                    min="5000"
                    max="500000"
                    step="5000"
                    value={simLumpAmount}
                    onChange={(e) => setSimLumpAmount(Number(e.target.value))}
                    className="pnr-range"
                  />
                ) : (
                  <input
                    type="range"
                    min="1000"
                    max="50000"
                    step="1000"
                    value={simSipAmount}
                    onChange={(e) => setSimSipAmount(Number(e.target.value))}
                    className="pnr-range"
                  />
                )}
              </div>

              <div className="pnr-sim-field">
                <label>Select Pioneer Mutual Fund</label>
                <select
                  value={simSelectedCode}
                  onChange={(e) => setSimSelectedCode(e.target.value)}
                  className="pnr-select"
                >
                  {initialFunds.slice(0, 30).map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.name} ({f.age_years}y — {f.ret_inception}% CAGR)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Asset Comparison Output Grid */}
            <div className="pnr-sim-results">
              <div className="pnr-asset-card hero">
                <div className="pnr-asset-icon">🚀</div>
                <div className="pnr-asset-name">{selectedFund.name}</div>
                <div className="pnr-asset-corpus accent">{fmtCurrency(simResults.fundCorpus)}</div>
                <div className="pnr-asset-details">
                  <span>CAGR: {selectedFund.ret_inception}%</span>
                  <span>Multiplier: {simResults.multiplier.toFixed(1)}x</span>
                </div>
              </div>

              <div className="pnr-asset-card">
                <div className="pnr-asset-icon">🪙</div>
                <div className="pnr-asset-name">Physical Gold</div>
                <div className="pnr-asset-corpus">{fmtCurrency(simResults.goldCorpus)}</div>
                <div className="pnr-asset-details">
                  <span>CAGR: ~10.5%</span>
                  <span>Invested: {fmtCurrency(simResults.principal)}</span>
                </div>
              </div>

              <div className="pnr-asset-card">
                <div className="pnr-asset-icon">🏦</div>
                <div className="pnr-asset-name">Fixed Deposit / PPF</div>
                <div className="pnr-asset-corpus">{fmtCurrency(simResults.fdCorpus)}</div>
                <div className="pnr-asset-details">
                  <span>CAGR: ~7.8%</span>
                  <span>Guaranteed Risk-Free</span>
                </div>
              </div>

              <div className="pnr-asset-card">
                <div className="pnr-asset-icon">📉</div>
                <div className="pnr-asset-name">Inflation Baseline (CPI)</div>
                <div className="pnr-asset-corpus">{fmtCurrency(simResults.infCorpus)}</div>
                <div className="pnr-asset-details">
                  <span>Avg CPI: ~6.5%</span>
                  <span>Breakeven Cost</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 2: INTERACTIVE ERA TIMELINE ── */}
        <section className="pnr-section">
          <div className="pnr-sec-header">
            <div className="pnr-sec-tag">Historical Timeline</div>
            <h2 className="pnr-sec-title">The Evolution of Indian Mutual Funds (1964 – 2026)</h2>
            <p className="pnr-sec-desc">
              Click any era to jump to and inspect the funds that originated during that milestone in Indian financial history.
            </p>
          </div>

          <div className="pnr-timeline">
            {ERAS.map((era) => (
              <div
                key={era.id}
                className={`pnr-era-card ${eraFilter === era.filterVal ? 'active' : ''}`}
                onClick={() => handleEraCardClick(era.filterVal)}
              >
                <span className="pnr-era-badge">{era.badge}</span>
                <h3 className="pnr-era-title">{era.title}</h3>
                <p className="pnr-era-text">{era.desc}</p>
                <div className="pnr-era-milestone">{era.milestone}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 3: SPOTLIGHT STORIES ── */}
        <section className="pnr-section">
          <div className="pnr-sec-header">
            <div className="pnr-sec-tag">Case Studies</div>
            <h2 className="pnr-sec-title">Titans That Defied Time</h2>
            <p className="pnr-sec-desc">
              Remarkable stories of the funds that shaped the modern Indian investment landscape.
            </p>
          </div>

          <div className="pnr-spotlights">
            {SPOTLIGHTS.map((sp, idx) => (
              <div key={idx} className="pnr-story-card">
                <div>
                  <div className="pnr-story-tag">{sp.tag}</div>
                  <h3 className="pnr-story-title">{sp.title}</h3>
                  <p className="pnr-story-body">{sp.desc}</p>
                </div>

                <div>
                  <div className="pnr-story-stats">
                    <div className="pnr-stat-item">
                      <div className="lbl">Inception Date</div>
                      <div className="val">{sp.launch}</div>
                    </div>
                    <div className="pnr-stat-item">
                      <div className="lbl">Since Inception CAGR</div>
                      <div className="val">{sp.cagr}</div>
                    </div>
                    <div className="pnr-stat-item">
                      <div className="lbl">Current NAV</div>
                      <div className="val">{sp.nav}</div>
                    </div>
                    <div className="pnr-stat-item">
                      <div className="lbl">Wealth Multiplier</div>
                      <div className="val">{sp.multiplier}</div>
                    </div>
                  </div>

                  <Link href={`/fund/${sp.code}`} className="pnr-btn-view">
                    View Full Analytics & Rolling Returns →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 4: 3 GOLDEN RULES OF COMPOUNDING ── */}
        <section className="pnr-section">
          <div className="pnr-sec-header">
            <div className="pnr-sec-tag">Compounding Insights</div>
            <h2 className="pnr-sec-title">The 3 Golden Rules of Multi-Decade Wealth Creation</h2>
            <p className="pnr-sec-desc">
              Lessons distilled from 30+ years of Indian stock market cycles, crises, and economic expansions.
            </p>
          </div>

          <div className="pnr-rules-grid">
            <div className="pnr-rule-card">
              <span className="pnr-rule-num">Rule 01</span>
              <h3 className="pnr-rule-title">The 15-Year Zero-Loss Rule</h3>
              <p className="pnr-rule-body">
                Across Indian mutual fund history, rolling returns demonstrate that the probability of negative returns drops to <strong>0.0%</strong> for holding periods of 15 years or longer in diversified equity schemes.
              </p>
            </div>

            <div className="pnr-rule-card">
              <span className="pnr-rule-num">Rule 02</span>
              <h3 className="pnr-rule-title">The High Cost of Market Timing</h3>
              <p className="pnr-rule-body">
                Investors who attempted to jump in and out of markets missed the few explosive recovery days. Over 30 years, staying uninterruptedly invested generated <strong>100x to 450x</strong> wealth multipliers.
              </p>
            </div>

            <div className="pnr-rule-card">
              <span className="pnr-rule-num">Rule 03</span>
              <h3 className="pnr-rule-title">The Silent Wealth Killer: Inflation</h3>
              <p className="pnr-rule-body">
                Over 30 years, ₹10,000 kept in cash lost 85% of purchasing power. Fixed Deposits grew it to ~₹1.0 Lakh, Gold to ~₹2.1 Lakhs, while top mutual fund pioneers compounded it to <strong>₹20 Lakhs to ₹45 Lakhs</strong>.
              </p>
            </div>
          </div>
        </section>

        {/* ── SECTION 5: HALL OF FAME DIRECTORY ── */}
        <section className="pnr-section" id="directory-section">
          <div className="pnr-sec-header">
            <div className="pnr-sec-tag">Verified Directory</div>
            <h2 className="pnr-sec-title">The 20+ Year Veteran Directory ({filteredFunds.length} Funds)</h2>
            <p className="pnr-sec-desc">
              All active mutual fund schemes in India with 20 or more years of continuous compounding track record.
            </p>
          </div>

          {/* Filter Bar */}
          <div className="pnr-filter-bar">
            <div className="pnr-search-wrap">
              <span className="pnr-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search by fund name, AMC, or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pnr-search-input"
              />
            </div>

            {/* Category Filter Select */}
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="pnr-cat-select"
            >
              <option value="all">All Categories</option>
              <option value="flexi">Flexi / Multi Cap</option>
              <option value="large">Large Cap</option>
              <option value="mid">Mid Cap</option>
              <option value="largemid">Large & Mid Cap</option>
              <option value="hybrid">Aggressive / Hybrid</option>
              <option value="elss">ELSS (Tax Saver)</option>
            </select>

            {/* Era Filter Pills */}
            <div className="pnr-pills">
              <button
                className={`pnr-pill ${eraFilter === 'all' ? 'active' : ''}`}
                onClick={() => setEraFilter('all')}
              >
                All 20+ Yrs ({initialFunds.length})
              </button>
              <button
                className={`pnr-pill ${eraFilter === '30y' ? 'active' : ''}`}
                onClick={() => setEraFilter('30y')}
              >
                🏆 30-Year Club (29)
              </button>
              <button
                className={`pnr-pill ${eraFilter === 'silver' ? 'active' : ''}`}
                onClick={() => setEraFilter('silver')}
              >
                🥈 Silver Jubilee (25-30Y)
              </button>
              <button
                className={`pnr-pill ${eraFilter === 'private' ? 'active' : ''}`}
                onClick={() => setEraFilter('private')}
              >
                🚀 Private Pioneers (1993-96)
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="pnr-table-wrap">
            <table className="pnr-table">
              <thead>
                <tr>
                  <th onClick={() => { setSortBy('age'); setSortDir(sortDir === 'desc' ? 'asc' : 'desc'); }}>
                    Fund Name & Category {sortBy === 'age' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th>Inception Date</th>
                  <th onClick={() => { setSortBy('age'); setSortDir(sortDir === 'desc' ? 'asc' : 'desc'); }}>
                    Age (Yrs) {sortBy === 'age' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th onClick={() => { setSortBy('nav'); setSortDir(sortDir === 'desc' ? 'asc' : 'desc'); }}>
                    Current NAV {sortBy === 'nav' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th onClick={() => { setSortBy('multiplier'); setSortDir(sortDir === 'desc' ? 'asc' : 'desc'); }}>
                    Multiplier {sortBy === 'multiplier' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th onClick={() => { setSortBy('cagr'); setSortDir(sortDir === 'desc' ? 'asc' : 'desc'); }}>
                    Inception CAGR {sortBy === 'cagr' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th onClick={() => { setSortBy('10y'); setSortDir(sortDir === 'desc' ? 'asc' : 'desc'); }}>
                    10Y CAGR {sortBy === '10y' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleFunds.map((f) => {
                  const navVal = parseFloat(f.nav) || 10;
                  const mult = (navVal / 10).toFixed(1);
                  return (
                    <tr key={f.code}>
                      <td>
                        <Link href={`/fund/${f.code}`} className="pnr-fund-name">
                          {f.name}
                        </Link>
                        <div className="pnr-fund-cat">{f.category} · {f.amc}</div>
                      </td>
                      <td>{String(f.inception_date || '').slice(0, 10)}</td>
                      <td><strong>{f.age_years} yrs</strong></td>
                      <td>₹{navVal.toFixed(2)}</td>
                      <td>
                        <span className="pnr-multiplier-badge">
                          {parseFloat(mult) >= 100 ? '🔥' : '⭐'} {mult}x
                        </span>
                      </td>
                      <td>
                        <span className="pnr-cagr-badge">
                          {f.ret_inception ? `${f.ret_inception}%` : '—'}
                        </span>
                      </td>
                      <td>{f.ret_10y ? `${f.ret_10y}%` : '—'}</td>
                      <td>
                        <Link href={`/fund/${f.code}`} className="pnr-btn-view">
                          Analytics →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {visibleFunds.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
                      No veteran funds match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredFunds.length > 0 && (
            <div className="pnr-pager">
              <div className="pnr-pager-info">
                Showing <b>{from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')}</b> of {filteredFunds.length.toLocaleString('en-IN')} funds
              </div>
              <div className="pnr-pager-ctrls">
                <button
                  className="pnr-pg-btn"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ‹ Prev
                </button>
                <span className="pnr-pg-now">
                  Page {page + 1} / {pageCount}
                </span>
                <button
                  className="pnr-pg-btn"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next ›
                </button>
              </div>
              <label className="pnr-pager-size">
                Show
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
        </section>

        {/* ── SECTION 5: FAQS & SEO CONTENT ── */}
        <section className="pnr-section">
          <div className="pnr-sec-header">
            <div className="pnr-sec-tag">Knowledge Base</div>
            <h2 className="pnr-sec-title">Frequently Asked Questions</h2>
            <p className="pnr-sec-desc">
              Everything you need to know about the history and compounding track record of Indian mutual funds.
            </p>
          </div>

          <div className="pnr-faqs">
            {FAQS.map((faq, idx) => (
              <div
                key={idx}
                className={`pnr-faq-item ${openFaq === idx ? 'open' : ''}`}
              >
                <div
                  className="pnr-faq-q"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <span>{faq.q}</span>
                  <span className="pnr-faq-icon">▼</span>
                </div>
                {openFaq === idx && <div className="pnr-faq-a">{faq.a}</div>}
              </div>
            ))}
          </div>
        </section>
      </main>

      <div className="container" style={{ marginTop: '56px' }}>
        <Footer />
      </div>
    </div>
  );
}
