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
    desc: 'Launched in October 1995 at ₹10.00 par value, this equity fund delivered an astonishing 21.94% CAGR over 30.9 years. A ₹10,000 investment at NFO has grown into an unbelievable ₹45.75 Lakhs today.',
    launch: '05-Oct-1995',
    initNav: '₹10.00',
    cagr: '21.94%',
    multiplier: '457.5x',
    nav: '₹4,575.45',
    code: '100377',
  },
  {
    tag: '🌟 The 3-Decade Flexi Cap Titan',
    title: 'HDFC Flexi Cap Fund (HDFC Equity Fund)',
    desc: 'Allotted in December 1994 at ₹10.00 par value, this flagship fund compounded through the Asian Crisis, Dot-Com Bust, 2008 GFC, and Covid at 18.35% CAGR, turning ₹10,000 into ₹20.82 Lakhs.',
    launch: '17-Dec-1994',
    initNav: '₹10.00',
    cagr: '18.35%',
    multiplier: '208.2x',
    nav: '₹2,082.61',
    code: '101762',
  },
  {
    tag: '🥇 The First Private Equity Fund',
    title: 'Franklin India Bluechip Fund (Kothari Pioneer)',
    desc: 'When SEBI opened the doors to private funds in 1993, Kothari Pioneer Bluechip was India’s first open-ended private equity scheme (₹10.00 NFO par value), compounding at 15.23% CAGR to cross ₹1,035 NAV.',
    launch: '01-Dec-1993',
    initNav: '₹10.00',
    cagr: '15.23%',
    multiplier: '103.5x',
    nav: '₹1,035.70',
    code: '100471',
  },
  {
    tag: '⚖️ The Hybrid Wealth Pioneer',
    title: 'Aditya Birla Sun Life Equity Hybrid \'95 Fund',
    desc: 'Proving that balanced equity-debt allocation creates generational wealth with lower drawdowns, this fund compounded at 17.39% CAGR over 31.5 years, growing ₹10 into ₹1,568.46.',
    launch: '11-Feb-1995',
    initNav: '₹10.00',
    cagr: '17.39%',
    multiplier: '156.8x',
    nav: '₹1,568.46',
    code: '103155',
  },
  {
    tag: '🏛️ The Founding Father (1986)',
    title: 'UTI Mastershare Unit Scheme (Large Cap)',
    desc: 'India’s very first equity mutual fund scheme launched by UTI in 1986 at ₹10.00 par value. Over nearly 40 continuous years, it weathered every political and financial cycle in modern Indian history.',
    launch: '15-Oct-1986',
    initNav: '₹10.00',
    cagr: '8.60%',
    multiplier: '26.8x',
    nav: '₹268.03',
    code: '100651',
  },
  {
    tag: '🛡️ The 30-Year Debt & Income Pioneer',
    title: 'Aditya Birla Sun Life Income Fund (Long Duration)',
    desc: 'Launched in October 1995 at ₹10.00 face value, ABSL Income Fund has delivered a steady 8.69% CAGR over 30.8 years (13.0x multiplier). Meanwhile, UTI Money Market (₹1,000 face value at launch in 1997) has grown to ₹7,660 (7.7x, 7.20% CAGR).',
    launch: '21-Oct-1995',
    initNav: '₹10.00 / ₹1,000',
    cagr: '8.69%',
    multiplier: '13.0x',
    nav: '₹130.12',
    code: '100038',
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
    q: 'Why do older debt and liquid mutual funds have NAVs in the thousands while equity funds started at ₹10?',
    a: (
      <>
        In the Indian mutual fund industry, Equity and Hybrid funds historically launched with an NFO face value of <strong>₹10.00</strong>. In contrast, Liquid, Money Market, and Overnight funds were introduced with a face value (initial NAV) of <strong>₹1,000.00</strong> (or <strong>₹100.00</strong> for certain low-duration and savings funds). Therefore, a liquid fund with a current NAV of ₹6,000 grew ~6x over 25+ years (compounding at ~6.5% to 7.5% annualised CAGR), not 600x.
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
  const [assetFilter, setAssetFilter] = useState('all');
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

  // Asset Class Counts
  const assetCounts = useMemo(() => {
    let eq = 0,
      hy = 0,
      dt = 0,
      ot = 0;
    for (const f of initialFunds) {
      const cat = (f.category || '').toLowerCase();
      if (cat.includes('equity') || cat.includes('elss')) eq++;
      else if (cat.includes('hybrid') || cat.includes('balanced') || cat.includes('asset allocation')) hy++;
      else if (
        cat.includes('debt') ||
        cat.includes('income') ||
        cat.includes('liquid') ||
        cat.includes('money market') ||
        cat.includes('gilt') ||
        cat.includes('bond') ||
        cat.includes('floater') ||
        cat.includes('duration')
      )
        dt++;
      else ot++;
    }
    return { all: initialFunds.length, equity: eq, hybrid: hy, debt: dt, other: ot };
  }, [initialFunds]);

  // Selected Fund for Simulator
  const selectedFund = useMemo(() => {
    return (
      initialFunds.find((f) => String(f.code) === String(simSelectedCode)) ||
      initialFunds[0] || {
        name: 'Nippon India Growth Mid Cap Fund',
        ret_inception: 21.94,
        age_years: 30.9,
        nav: 4575.45,
        initial_nav: 10,
      }
    );
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
    return initialFunds
      .filter((f) => {
        // Search
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchesName = f.name?.toLowerCase().includes(q);
          const matchesAmc = f.amc?.toLowerCase().includes(q);
          const matchesCat = f.category?.toLowerCase().includes(q);
          if (!matchesName && !matchesAmc && !matchesCat) return false;
        }

        // Asset Class
        const cat = (f.category || '').toLowerCase();
        const isEq = cat.includes('equity') || cat.includes('elss');
        const isHy = cat.includes('hybrid') || cat.includes('balanced') || cat.includes('asset allocation');
        const isDt =
          cat.includes('debt') ||
          cat.includes('income') ||
          cat.includes('liquid') ||
          cat.includes('money market') ||
          cat.includes('gilt') ||
          cat.includes('bond') ||
          cat.includes('floater') ||
          cat.includes('duration');

        if (assetFilter === 'equity' && !isEq) return false;
        if (assetFilter === 'hybrid' && !isHy) return false;
        if (assetFilter === 'debt' && !isDt) return false;
        if (assetFilter === 'other' && (isEq || isHy || isDt)) return false;

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
          if (catFilter === 'flexi' && !cat.includes('flexi') && !cat.includes('multi cap')) return false;
          if (catFilter === 'large' && (!cat.includes('large cap') || cat.includes('large & mid'))) return false;
          if (catFilter === 'mid' && !cat.includes('mid cap')) return false;
          if (catFilter === 'largemid' && !cat.includes('large & mid')) return false;
          if (catFilter === 'hybrid' && !cat.includes('hybrid') && !cat.includes('balanced')) return false;
          if (catFilter === 'elss' && !cat.includes('elss') && !cat.includes('tax')) return false;
          if (catFilter === 'debt_long' && !cat.includes('medium to long') && !cat.includes('long duration') && !cat.includes('income')) return false;
          if (catFilter === 'debt_liquid' && !cat.includes('liquid') && !cat.includes('overnight')) return false;
          if (catFilter === 'debt_money' && !cat.includes('money market')) return false;
          if (catFilter === 'debt_gilt' && !cat.includes('gilt')) return false;
          if (catFilter === 'debt_corp' && !cat.includes('corporate bond') && !cat.includes('credit risk')) return false;
          if (catFilter === 'debt_short' && !cat.includes('short duration') && !cat.includes('low duration') && !cat.includes('ultra short')) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          const nA = a.name || '';
          const nB = b.name || '';
          return sortDir === 'asc' ? nA.localeCompare(nB) : nB.localeCompare(nA);
        }
        if (sortBy === 'incDate') {
          const dA = a.inception_date || '';
          const dB = b.inception_date || '';
          // desc = oldest first (1986 -> 2006)
          return sortDir === 'desc' ? dA.localeCompare(dB) : dB.localeCompare(dA);
        }

        let vA = 0;
        let vB = 0;
        if (sortBy === 'age') {
          vA = parseFloat(a.age_years) || 0;
          vB = parseFloat(b.age_years) || 0;
        } else if (sortBy === 'initNav') {
          vA = parseFloat(a.initial_nav) || 10;
          vB = parseFloat(b.initial_nav) || 10;
        } else if (sortBy === 'cagr') {
          vA = parseFloat(a.ret_inception) || 0;
          vB = parseFloat(b.ret_inception) || 0;
        } else if (sortBy === 'multiplier') {
          const initA = parseFloat(a.initial_nav) || 10;
          const initB = parseFloat(b.initial_nav) || 10;
          vA = (parseFloat(a.nav) || initA) / initA;
          vB = (parseFloat(b.nav) || initB) / initB;
        } else if (sortBy === '10y') {
          vA = parseFloat(a.ret_10y) || 0;
          vB = parseFloat(b.ret_10y) || 0;
        } else if (sortBy === 'nav') {
          vA = parseFloat(a.nav) || 0;
          vB = parseFloat(b.nav) || 0;
        }
        return sortDir === 'desc' ? vB - vA : vA - vB;
      });
  }, [initialFunds, search, assetFilter, eraFilter, catFilter, sortBy, sortDir]);

  // Reset to first page whenever filters or page size change
  useEffect(() => {
    setPage(0);
  }, [search, assetFilter, eraFilter, catFilter, sortBy, sortDir, pageSize]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      // Default to DESC (large to small / highest first) on first click
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  };

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
                <span><strong>Initial Face Values:</strong> Equity funds launched at ₹10 face value, while Liquid & Money Market funds launched at ₹1,000 face value.</span>
              </div>
              <div className="pnr-takeaway-item">
                <span className="pnr-takeaway-dot"></span>
                <span><strong>Zero 15-Year Loss Probability:</strong> No diversified open-ended Indian equity scheme has ever lost money over a 15+ year holding period.</span>
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
                <label>
                  <span>Select Pioneer Scheme</span>
                  <span className="val">{selectedFund.name}</span>
                </label>
                <select
                  value={simSelectedCode}
                  onChange={(e) => setSimSelectedCode(e.target.value)}
                  className="pnr-select"
                >
                  {initialFunds.slice(0, 40).map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.name} ({f.age_years} yrs · {f.ret_inception ? `${f.ret_inception}% CAGR` : '—'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Results Grid */}
            <div className="pnr-sim-results">
              <div className="pnr-res-card fund">
                <div className="pnr-res-title">
                  <span>🚀 {selectedFund.name}</span>
                  <span className="pnr-res-rate">{selectedFund.ret_inception || '15.0'}% CAGR</span>
                </div>
                <div className="pnr-res-val">{fmtCurrency(simResults.fundCorpus)}</div>
                <div className="pnr-res-sub">
                  <span>Multiplier: {simResults.multiplier.toFixed(1)}x</span>
                  <span>Over {simResults.ageYrs} Years</span>
                </div>
              </div>

              <div className="pnr-res-card gold">
                <div className="pnr-res-title">
                  <span>🥇 Physical Gold (India)</span>
                  <span className="pnr-res-rate">10.5% CAGR</span>
                </div>
                <div className="pnr-res-val">{fmtCurrency(simResults.goldCorpus)}</div>
                <div className="pnr-res-sub">
                  <span>Multiplier: {(simResults.goldCorpus / simResults.principal).toFixed(1)}x</span>
                  <span>Historical bullion price growth</span>
                </div>
              </div>

              <div className="pnr-res-card fd">
                <div className="pnr-res-title">
                  <span>🏦 Bank Fixed Deposit</span>
                  <span className="pnr-res-rate">7.8% CAGR</span>
                </div>
                <div className="pnr-res-val">{fmtCurrency(simResults.fdCorpus)}</div>
                <div className="pnr-res-sub">
                  <span>Multiplier: {(simResults.fdCorpus / simResults.principal).toFixed(1)}x</span>
                  <span>Pre-tax compounded deposit rate</span>
                </div>
              </div>

              <div className="pnr-res-card inf">
                <div className="pnr-res-title">
                  <span>📉 CPI Inflation (Purchasing Power)</span>
                  <span className="pnr-res-rate">6.5% Inflation</span>
                </div>
                <div className="pnr-res-val">{fmtCurrency(simResults.infCorpus)}</div>
                <div className="pnr-res-sub">
                  <span>Required just to maintain purchasing power</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 2: 6 HISTORICAL ERAS OF INDIAN MUTUAL FUNDS ── */}
        <section className="pnr-section">
          <div className="pnr-sec-header">
            <div className="pnr-sec-tag">Historical Timeline</div>
            <h2 className="pnr-sec-title">The 6 Eras of Indian Mutual Fund History</h2>
            <p className="pnr-sec-desc">
              From the 1964 UTI monopoly to the ₹25,000+ Crore monthly SIP supercycle of 2026. Click any era to filter veteran schemes.
            </p>
          </div>

          <div className="pnr-eras-grid">
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
                      <div className="lbl">Initial Face Value</div>
                      <div className="val">{sp.initNav}</div>
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
                Investors who attempted to jump in and out of markets missed the few explosive recovery days. Over 30 years, staying uninterruptedly invested generated <strong>100x to 450x</strong> wealth multipliers in equities.
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

          {/* ── Educational Banner on Face Values ── */}
          <div className="pnr-facevalue-banner">
            <div className="pnr-fv-header">
              <span className="pnr-fv-badge">💡 Crucial Historical Fact</span>
              <h3 className="pnr-fv-title">Understanding Historical Face Values & Starting NAVs (₹10 vs ₹100 vs ₹1,000)</h3>
            </div>
            <p className="pnr-fv-desc">
              Not all mutual funds in India started with an NAV of ₹10. Depending on the asset class, AMCs launched schemes at different initial face values:
            </p>
            <div className="pnr-fv-grid">
              <div className="pnr-fv-card">
                <div className="pnr-fv-card-tag eq">Equity & Hybrid Funds</div>
                <div className="pnr-fv-val">₹10.00 Starting NAV</div>
                <p>Launched at ₹10 face value. Compounded into 25x to 457x multi-baggers (15%–22% CAGR) over 30 years.</p>
              </div>
              <div className="pnr-fv-card">
                <div className="pnr-fv-card-tag debt">Liquid & Money Market Funds</div>
                <div className="pnr-fv-val">₹1,000.00 Starting NAV</div>
                <p>Launched at ₹1,000 face value. Current NAVs of ₹4,000–₹7,600 represent a realistic 4x–7.7x wealth growth (6.5%–7.5% CAGR), not 600x.</p>
              </div>
              <div className="pnr-fv-card">
                <div className="pnr-fv-card-tag savings">Savings & Low Duration Funds</div>
                <div className="pnr-fv-val">₹100.00 Starting NAV</div>
                <p>Launched at or consolidated to ₹100 face value. Current NAVs of ₹400–₹700 represent 4x–7x steady debt returns.</p>
              </div>
            </div>
          </div>

          {/* Asset Class Filter Switcher */}
          <div className="pnr-asset-tabs-wrap">
            <div className="pnr-asset-tabs">
              <button
                className={`pnr-asset-btn ${assetFilter === 'all' ? 'active' : ''}`}
                onClick={() => setAssetFilter('all')}
              >
                All Assets <span className="pnr-asset-count">{assetCounts.all}</span>
              </button>
              <button
                className={`pnr-asset-btn ${assetFilter === 'equity' ? 'active' : ''}`}
                onClick={() => setAssetFilter('equity')}
              >
                📈 Equity <span className="pnr-asset-count">{assetCounts.equity}</span>
              </button>
              <button
                className={`pnr-asset-btn ${assetFilter === 'hybrid' ? 'active' : ''}`}
                onClick={() => setAssetFilter('hybrid')}
              >
                ⚖️ Hybrid <span className="pnr-asset-count">{assetCounts.hybrid}</span>
              </button>
              <button
                className={`pnr-asset-btn ${assetFilter === 'debt' ? 'active' : ''}`}
                onClick={() => setAssetFilter('debt')}
              >
                🛡️ Debt & Liquid <span className="pnr-asset-count">{assetCounts.debt}</span>
              </button>
              <button
                className={`pnr-asset-btn ${assetFilter === 'other' ? 'active' : ''}`}
                onClick={() => setAssetFilter('other')}
              >
                📊 Other/Index <span className="pnr-asset-count">{assetCounts.other}</span>
              </button>
            </div>
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
              <option value="all">All Sub-Categories</option>
              <option value="flexi">Flexi / Multi Cap</option>
              <option value="large">Large Cap</option>
              <option value="mid">Mid Cap</option>
              <option value="largemid">Large & Mid Cap</option>
              <option value="hybrid">Aggressive / Hybrid</option>
              <option value="elss">ELSS (Tax Saver)</option>
              <option value="debt_long">Long / Medium Duration / Income</option>
              <option value="debt_liquid">Liquid & Overnight Funds</option>
              <option value="debt_money">Money Market Funds</option>
              <option value="debt_gilt">Gilt & Govt Securities</option>
              <option value="debt_corp">Corporate Bond & Credit Risk</option>
              <option value="debt_short">Short & Low Duration</option>
            </select>

            {/* Era Filter Pills */}
            <div className="pnr-pills">
              <button
                className={`pnr-pill ${eraFilter === 'all' ? 'active' : ''}`}
                onClick={() => setEraFilter('all')}
              >
                All Eras ({initialFunds.length})
              </button>
              <button
                className={`pnr-pill ${eraFilter === '30y' ? 'active' : ''}`}
                onClick={() => setEraFilter('30y')}
              >
                🏆 30Y Club (29)
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
                  <th onClick={() => handleSort('name')}>
                    Fund Name & Category {sortBy === 'name' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th onClick={() => handleSort('incDate')}>
                    Launch Date {sortBy === 'incDate' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th className="num" onClick={() => handleSort('age')}>
                    Age {sortBy === 'age' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th className="num" onClick={() => handleSort('initNav')}>
                    Face Value {sortBy === 'initNav' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th className="num" onClick={() => handleSort('nav')}>
                    Current NAV {sortBy === 'nav' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th className="num" onClick={() => handleSort('multiplier')}>
                    Multiplier {sortBy === 'multiplier' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th className="num" onClick={() => handleSort('cagr')}>
                    Inception CAGR {sortBy === 'cagr' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th className="num" onClick={() => handleSort('10y')}>
                    10Y CAGR {sortBy === '10y' ? (sortDir === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleFunds.map((f) => {
                  const initNav = f.initial_nav || 10;
                  const navVal = parseFloat(f.nav) || initNav;
                  const mult = (navVal / initNav).toFixed(1);
                  const isHighMult = parseFloat(mult) >= 100;
                  return (
                    <tr key={f.code}>
                      <td>
                        <Link href={`/fund/${f.code}`} className="pnr-fund-name">
                          {f.name}
                        </Link>
                        <div className="pnr-fund-cat">{f.category} · {f.amc}</div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{String(f.inception_date || '').slice(0, 10)}</td>
                      <td className="num">{f.age_years} yrs</td>
                      <td className="num">
                        <span className={`pnr-initnav-badge ${initNav >= 1000 ? 'init-1000' : initNav >= 100 ? 'init-100' : 'init-10'}`}>
                          ₹{initNav.toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="num">₹{navVal.toFixed(2)}</td>
                      <td className="num">
                        <span className="pnr-multiplier-badge">
                          {isHighMult ? '🔥' : '⭐'} {mult}x
                        </span>
                      </td>
                      <td className="num">
                        <span className="pnr-cagr-badge">
                          {f.ret_inception != null ? `${f.ret_inception}%` : '—'}
                        </span>
                      </td>
                      <td className="num">{f.ret_10y ? `${f.ret_10y}%` : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <Link href={`/fund/${f.code}`} className="pnr-btn-view">
                          Analytics →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {visibleFunds.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
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
            </div>
          )}
        </section>

        {/* ── SECTION 6: FAQS ── */}
        <section className="pnr-section">
          <div className="pnr-sec-header">
            <div className="pnr-sec-tag">Knowledge Base</div>
            <h2 className="pnr-sec-title">Frequently Asked Questions</h2>
            <p className="pnr-sec-desc">
              Essential facts about the origins, regulations, and long-term track records of Indian mutual funds.
            </p>
          </div>

          <div className="pnr-faqs">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className={`pnr-faq-item ${isOpen ? 'open' : ''}`}>
                  <button
                    className="pnr-faq-q"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <span className="pnr-faq-icon">▾</span>
                  </button>
                  {isOpen && <div className="pnr-faq-a">{faq.a}</div>}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
