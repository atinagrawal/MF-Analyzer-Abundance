import { getPageMeta } from '@/lib/metadata';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import HomeScripts from './HomeScripts';

/**
 * app/page.js — Home page (MF Calculator)
 *
 * Server Component. Renders the full home page:
 *   - Metadata (via getPageMeta)
 *   - JSON-LD structured data
 *   - Static HTML shell with Navbar + calculator panels + FAQ + Footer
 *   - HomeScripts (Client Component) loads Chart.js then mfcalc-main.js
 *
 * All interactivity is driven by /js/mfcalc-main.js (vanilla JS, DOM-based).
 * dangerouslySetInnerHTML is used for the 1600-line panel HTML so inline
 * onclick= handlers work with the globally-scoped vanilla JS functions.
 */

export const metadata = getPageMeta('home');

/* ── JSON-LD Schemas ─────────────────────────────────────────────────── */
const SCHEMA_WEB_APP        = {"@context":"https://schema.org","@type":"WebApplication","name":"MF Analyzer — SIP, SWP Backtester, Fund Compare & EMI","alternateName":"MF Analyzer by Abundance","url":"https://mfcalc.getabundance.in/","description":"Free all-in-one financial calculator. SIP NAV Backtester and SWP NAV Backtester using real historical fund NAVs with XIRR. Compare MF returns & Sharpe ratio. Goal planner. EMI calculator. Live AMFI NAV data. By Abundance Financial Services ARN-251838.","applicationCategory":"FinanceApplication","operatingSystem":"Any","browserRequirements":"Requires JavaScript","offers":{"@type":"Offer","price":"0","priceCurrency":"INR"},"featureList":["Mutual Fund Comparison — up to 5 funds simultaneously","Live AMFI NAV Data via mfapi.in","Risk Table — 1M, 3M, 1Y, 3Y, 5Y returns per fund","Sharpe Ratio, Annualised Volatility & Max Drawdown (5Y or full history)","SIP Returns Calculator with Step-up SIP","Lumpsum Investment Calculator","Investment Goal Planner — SIP, lumpsum or hybrid","SWP — Systematic Withdrawal Plan with corpus longevity analysis","EMI Calculator for Home, Car & Personal Loans","Loan Prepayment Analyser with Interest Savings","Balance Transfer Analyser for Loans","Year-by-Year Amortisation Schedule","SIP NAV Backtester — backtest monthly SIP against real historical NAV data with XIRR","SIP NAV Backtester — backtest monthly SIP against real historical NAV data with XIRR","SWP NAV Backtester — replay SWP against real historical fund NAV data","XIRR calculation on actual SWP cashflows","What-if start-year comparison table for SWP","Delay/accumulation phase with real NAV growth before SWP","Shareable SWP Backtester URLs with dynamic OG image","Discontinued AMC filtering (13 wound-down fund houses hidden by default)","State-wise India map","Geographic AUM distribution"],"audience":{"@type":"Audience","audienceType":"Individual investors, loan seekers, financial planners"},"author":{"@type":"Organization","name":"Abundance Financial Services","url":"https://www.getabundance.in","logo":{"@type":"ImageObject","url":"https://mfcalc.getabundance.in/logo-og.png","width":90,"height":90},"telephone":"+919808105923","email":"contact@getabundance.in","address":{"@type":"PostalAddress","streetAddress":"1st Floor, Kapil Complex, Mukhani","addressLocality":"Haldwani","addressRegion":"Uttarakhand","postalCode":"263139","addressCountry":"IN"},"sameAs":["https://www.instagram.com/abundancefinancialservices","https://www.facebook.com/abundancefinancialservices","https://twitter.com/abundancefinsvs"]}};
const SCHEMA_BREADCRUMB     = {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Abundance Financial Services","item":"https://www.getabundance.in"},{"@type":"ListItem","position":2,"name":"MF Calculator","item":"https://mfcalc.getabundance.in/"}]};
const SCHEMA_LOCAL_BUSINESS = {"@context":"https://schema.org","@type":["FinancialService","LocalBusiness"],"name":"Abundance Financial Services","alternateName":"Abundance FS","url":"https://www.getabundance.in","logo":"https://mfcalc.getabundance.in/logo-og.png","image":"https://mfcalc.getabundance.in/og-mfcalc.png","description":"AMFI-registered Mutual Fund and SIF Distributor serving investors across India. Registered office in Haldwani, Uttarakhand. Expert advice on SIP, lumpsum, goal-based investing, SWP for retirement income, and loan planning. ARN-251838.","telephone":"+919808105923","email":"contact@getabundance.in","priceRange":"Free","currenciesAccepted":"INR","paymentAccepted":"Online Transfer, Cheque","openingHours":"Mo-Sa 09:30-18:30","address":{"@type":"PostalAddress","streetAddress":"1st Floor, Kapil Complex, Mukhani","addressLocality":"Haldwani","addressRegion":"Uttarakhand","postalCode":"263139","addressCountry":"IN"},"geo":{"@type":"GeoCoordinates","latitude":29.2183,"longitude":79.513},"hasMap":"https://maps.app.goo.gl/TgQSLRDo3UBKR77g7","areaServed":[{"@type":"Country","name":"India"},{"@type":"State","name":"Uttarakhand"},{"@type":"State","name":"Delhi"},{"@type":"State","name":"Maharashtra"},{"@type":"State","name":"Karnataka"},{"@type":"State","name":"Gujarat"},{"@type":"City","name":"Haldwani"},{"@type":"City","name":"Mumbai"},{"@type":"City","name":"Delhi"},{"@type":"City","name":"Bengaluru"},{"@type":"City","name":"Pune"}],"serviceType":["Mutual Fund Distribution","Specialised Investment Fund (SIF) Distribution","SIP Planning","Goal-based Financial Planning","Systematic Withdrawal Plan (SWP)","Portfolio Management Services (PMS) Distribution","Alternative Investment Fund (AIF) Distribution","Health Insurance","Loan Advisory"],"sameAs":["https://www.instagram.com/abundancefinancialservices","https://www.facebook.com/abundancefinancialservices","https://twitter.com/abundancefinsvs"],"dateModified":"2026-04-01","identifier":[{"@type":"PropertyValue","name":"AMFI ARN","value":"ARN-251838"},{"@type":"PropertyValue","name":"GST","value":"05AXYPA6954G1Z3"}]};
const SCHEMA_WEBSITE        = {"@context":"https://schema.org","@type":"WebSite","name":"Abundance MF & Loan Calculator","url":"https://mfcalc.getabundance.in/","description":"Free mutual fund comparison, SIP, SWP, EMI and goal planner tool by Abundance Financial Services® — serving investors across India.","publisher":{"@type":"Organization","name":"Abundance Financial Services","url":"https://www.getabundance.in"},"potentialAction":{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https://mfcalc.getabundance.in/?q={search_term_string}"},"query-input":"required name=search_term_string"}};
const SCHEMA_SOFTWARE_APP   = {"@context":"https://schema.org","@type":"SoftwareApplication","name":"Abundance MF & Loan Calculator Suite","url":"https://mfcalc.getabundance.in/","applicationCategory":"FinanceApplication","operatingSystem":"Web","browserRequirements":"Requires JavaScript","offers":{"@type":"Offer","price":"0","priceCurrency":"INR"},"featureList":["Mutual Fund Comparison with live AMFI NAV data","Sharpe Ratio and Max Drawdown analysis","SIP and Lumpsum return calculator","Systematic Withdrawal Plan (SWP) calculator","Investment Goal Planner","EMI calculator with amortisation schedule","Balance Transfer analyser","SIF (Specialised Investment Fund) information"],"author":{"@type":"Organization","name":"Abundance Financial Services","url":"https://www.getabundance.in"},"datePublished":"2024-01-01","dateModified":"2026-03-21"};
const SCHEMA_FAQ            = {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"How do I compare mutual funds online for free?","acceptedAnswer":{"@type":"Answer","text":"Use the Fund Compare tab in this tool. Search for any AMFI-registered mutual fund by name or AMC. You can add up to 5 funds simultaneously and compare their NAV performance, 1M/3M/1Y/3Y/5Y returns, Sharpe ratio, volatility and maximum drawdown — all using live data from AMFI via mfapi.in."}},{"@type":"Question","name":"What is Sharpe Ratio in mutual funds and what is a good score?","acceptedAnswer":{"@type":"Answer","text":"Sharpe Ratio measures risk-adjusted return. It is calculated as (Fund CAGR minus risk-free rate) divided by annualised volatility. This tool uses 6.5% as the risk-free rate, approximating current Indian G-Sec yields. A Sharpe above 1 is considered good, above 2 is excellent. The tool calculates Sharpe using 5 years of data, or the full available history if the fund is younger than 5 years."}},{"@type":"Question","name":"How is SIP return calculated?","acceptedAnswer":{"@type":"Answer","text":"SIP returns are calculated using a compounding model where each monthly instalment earns returns for the remaining investment period. The tool shows corpus at three scenarios — conservative, moderate and aggressive — based on your chosen return rate. The SIP calculator also supports step-up SIP where you increase your monthly investment by a fixed percentage each year."}},{"@type":"Question","name":"What is SWP in mutual funds and how is it used for retirement income?","acceptedAnswer":{"@type":"Answer","text":"SWP stands for Systematic Withdrawal Plan. It lets investors withdraw a fixed amount from their mutual fund corpus at regular intervals while the remaining corpus continues to grow. This tool's SWP calculator models corpus longevity, month-by-month depletion, and shows how long your corpus will last at different withdrawal rates and return assumptions. It also supports a delay period before withdrawals begin."}},{"@type":"Question","name":"How much SIP do I need to reach my investment goal?","acceptedAnswer":{"@type":"Answer","text":"Use the Goal Planner tab. Enter your target amount, time horizon, expected return rate and any existing corpus. The calculator will compute the required monthly SIP, one-time lumpsum, or a combination of both to reach your goal. It also accounts for inflation adjustment on the target amount."}},{"@type":"Question","name":"How is EMI calculated and what is an amortisation schedule?","acceptedAnswer":{"@type":"Answer","text":"EMI is calculated using the formula: EMI = P × r × (1+r)^n / ((1+r)^n − 1), where P is the loan amount, r is the monthly interest rate and n is the total number of instalments. An amortisation schedule shows, year by year, how much of each EMI goes toward interest versus principal. In early years, most of the EMI is interest. This tool provides the full year-by-year schedule with prepayment rows highlighted."}},{"@type":"Question","name":"Should I transfer my home loan to a lower interest rate lender?","acceptedAnswer":{"@type":"Answer","text":"Use the Balance Transfer Analyser in the EMI tab. Enter your current loan details and the new lender's rate and processing fee. The tool will calculate whether the interest savings over your remaining tenure outweigh the switching cost and show a clear verdict — transfer recommended, not recommended, or marginal — with exact numbers."}},{"@type":"Question","name":"Is this mutual fund and SIP calculator free to use?","acceptedAnswer":{"@type":"Answer","text":"Yes, completely free. This tool is provided by Abundance Financial Services® (AMFI ARN-251838), a SEBI-registered Mutual Funds Distributor based in Haldwani, Uttarakhand. All fund NAV data is sourced live from AMFI via the open mfapi.in API. No login or signup is required."}},{"@type":"Question","name":"What is a Specialised Investment Fund (SIF) in India?","acceptedAnswer":{"@type":"Answer","text":"A Specialised Investment Fund (SIF) is a new SEBI-regulated investment category launched in 2025, positioned between Mutual Funds and Portfolio Management Services (PMS). SIFs require a minimum investment of ₹10 lakh and offer more flexible investment strategies than traditional mutual funds, including long-short equity, derivatives overlay, and concentrated portfolios. They are distributed by AMFI-registered SIF Distributors."}},{"@type":"Question","name":"What is the minimum investment in a Specialised Investment Fund (SIF)?","acceptedAnswer":{"@type":"Answer","text":"The minimum investment in a Specialised Investment Fund (SIF) is ₹10 lakh per investor. Unlike mutual funds which start at ₹500, SIFs are designed for sophisticated investors with higher risk capacity and a larger investable surplus. SIF units can be held in demat form."}},{"@type":"Question","name":"What is the difference between SIF, PMS, and Mutual Funds?","acceptedAnswer":{"@type":"Answer","text":"Mutual Funds start from as low as ₹500 and are strictly regulated by SEBI with standardised strategies. SIFs (Specialised Investment Funds) require ₹10 lakh minimum and allow more flexible, differentiated strategies including long-short positions. PMS (Portfolio Management Services) requires ₹50 lakh minimum and offers fully customised portfolios. SIFs bridge the gap — offering flexibility beyond mutual funds but more affordably than PMS. Abundance Financial Services® is an authorised distributor of all three."}},{"@type":"Question","name":"Who is eligible to invest in a SIF in India?","acceptedAnswer":{"@type":"Answer","text":"Any resident Indian individual, HUF, NRI, or institutional investor can invest in a Specialised Investment Fund (SIF) provided they meet the ₹10 lakh minimum investment threshold. Investors must complete standard KYC. The higher minimum is intended to ensure that SIF investors have the financial sophistication and risk tolerance for more complex strategies."}},{"@type":"Question","name":"How is a SIF taxed in India?","acceptedAnswer":{"@type":"Answer","text":"SIF taxation follows rules similar to mutual funds. Equity-oriented SIFs held for more than 1 year attract Long Term Capital Gains (LTCG) tax at 12.5% on gains above ₹1.25 lakh per year. Short-term gains (held less than 1 year) are taxed at 20%. Debt-oriented SIF gains are added to income and taxed at the investor's slab rate. Tax treatment may evolve as SEBI and the Income Tax Department finalise SIF-specific rules — consult a tax advisor for the latest guidance."}},{"@type":"Question","name":"Can I invest in SIF through Abundance Financial Services, Haldwani?","acceptedAnswer":{"@type":"Answer","text":"Yes. Abundance Financial Services® (ARN-251838) is an AMFI-registered SIF Distributor serving investors across India. You can contact us at +91 98081 05923 or visit getabundance.in to explore SIF investment options tailored to your financial goals and risk profile."}},{"@type":"Question","name":"What is the SIP NAV Backtester and how is it different from the SIP Calculator?","acceptedAnswer":{"@type":"Answer","text":"The SIP Calculator projects a future corpus using an assumed return rate. The SIP NAV Backtester uses actual historical NAV data from AMFI — it buys fund units at real monthly NAVs, calculates the real corpus accumulated, and computes the actual XIRR. This shows exactly how a SIP would have performed on a specific fund over a specific time period, including market crashes and recoveries. The tool also shows a what-if comparison table for different start years on the same fund."}},{"@type":"Question","name":"What is the SWP NAV Backtester and how does it work?","acceptedAnswer":{"@type":"Answer","text":"The SWP NAV Backtester in this tool lets you replay a Systematic Withdrawal Plan against a mutual fund's actual historical NAV data. You enter a corpus, monthly withdrawal, optional step-up, and date range. The tool simulates month-by-month unit redemption at real NAVs and shows whether the corpus survived, the XIRR earned on actual cashflows, total withdrawn, remaining corpus, and a what-if comparison table for different start years."}},{"@type":"Question","name":"What is XIRR and why is it used in the SWP backtester?","acceptedAnswer":{"@type":"Answer","text":"XIRR (Extended Internal Rate of Return) calculates the annualised return on irregular cashflows. In a SWP backtest, the initial corpus is invested as a lump sum and monthly withdrawals happen at varying NAVs over time. CAGR cannot handle these intermediate cashflows correctly. XIRR accounts for the timing and size of every withdrawal, giving an accurate annualised return figure. A positive XIRR means the corpus grew faster than withdrawals; negative means withdrawals exceeded growth."}},{"@type":"Question","name":"Can I share my SWP backtest results with others?","acceptedAnswer":{"@type":"Answer","text":"Yes. The SWP Backtester has a Share URL button that encodes all inputs and key results into a URL. When shared on WhatsApp, LinkedIn or Telegram, the link generates a rich preview card showing the fund name, backtest period, XIRR, corpus survival status, and key amounts. The recipient opens the same backtest pre-loaded in their browser — no login required."}},{"@type":"Question","name":"What is the SIP NAV Backtester and how is it different from a regular SIP calculator?","acceptedAnswer":{"@type":"Answer","text":"A regular SIP calculator assumes a fixed annual return rate. The SIP NAV Backtester uses a fund's actual historical NAV data to simulate what really happened. Each monthly instalment buys units at the real NAV for that month. The final corpus is calculated from actual accumulated units — including the effect of real market crashes, rallies, and volatility. You get XIRR on actual cashflows and a What-If table comparing different start years."}},{"@type":"Question","name":"How is XIRR calculated in the SIP NAV Backtester?","acceptedAnswer":{"@type":"Answer","text":"Each monthly SIP instalment is treated as a negative cashflow on its actual investment date, and the final corpus is a positive cashflow on the end date. XIRR finds the annualised return that makes all cashflows sum to zero in net present value terms. Unlike CAGR, XIRR accounts for the timing of every instalment and is the correct measure for periodic SIP investments."}},{"@type":"Question","name":"Can I compare how a SIP would have performed starting in different years?","acceptedAnswer":{"@type":"Answer","text":"Yes. The SIP NAV Backtester includes a What-If table that automatically tests your SIP parameters with 5 different start years across the fund's available NAV history. This reveals how starting during a bull market, a crash, or a recovery would have changed the final corpus and XIRR — showing the real impact of market timing on SIP outcomes."}}]};

/* ── Main calculator HTML (brand strip + tabs + all panels) ──────────── */
/* Extracted from public/index.html lines 2229–3693.                      */
/* Inline onclick= handlers (switchMainTab, calcSIP, etc.) resolve via    */
/* /js/mfcalc-main.js which defines them in global scope.                 */
const MAIN_HTML = `

<!-- BRAND STRIP -->
<div class="brand-strip">
  <div class="brand-strip-inner">

    <!-- Left: live badge + title -->
    <div class="brand-strip-left">
      <span class="brand-strip-eyebrow">
        <span class="brand-strip-dot"></span>Live AMFI Data
      </span>
      <p class="brand-strip-title" aria-hidden="true">MF &amp; Loan Calculator Suite</p>
    </div>

    <!-- Center: scrolling category ticker -->
    <div class="brand-ticker-wrap">
      <div class="brand-ticker" id="brandTicker">
        <span class="bt-item">📈 Large Cap</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🚀 Small Cap</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">⚡ Mid Cap</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🌿 Flexi Cap</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">💰 ELSS</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🏦 Debt</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">⚖️ Hybrid</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🌍 International</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">📊 Index</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">💎 Multi Asset</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🏠 Home Loan EMI</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🚗 Car Loan EMI</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🎓 Education Loan</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">💳 Personal Loan</span>
        <span class="bt-sep">·</span>
        <!-- duplicate for seamless loop -->
        <span class="bt-item">📈 Large Cap</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🚀 Small Cap</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">⚡ Mid Cap</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🌿 Flexi Cap</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">💰 ELSS</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🏦 Debt</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">⚖️ Hybrid</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🌍 International</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">📊 Index</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">💎 Multi Asset</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🏠 Home Loan EMI</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🚗 Car Loan EMI</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">🎓 Education Loan</span>
        <span class="bt-sep">·</span>
        <span class="bt-item">💳 Personal Loan</span>
        <span class="bt-sep">·</span>
      </div>
    </div>

    <!-- Right: IST clock -->
    <div class="brand-strip-right">
      <div class="brand-clock">
        <span class="brand-clock-time" id="brandClockTime">--:--:--</span>
        <span class="brand-clock-label">IST</span>
      </div>
    </div>

  </div>
</div>

<!-- ═══ MAIN NAVIGATION TABS ═══ -->
<div class="main-tabs-wrap" id="mainTabsWrap">
  <nav class="main-tabs-bar" role="tablist" aria-label="Calculator sections">
    <button class="main-tab active" id="mtab-fund" role="tab" aria-selected="true" aria-controls="mpanel-fund" onclick="switchMainTab('fund',this)" title="Fund Comparison">
      <span class="main-tab-icon">📈</span><span class="main-tab-label">Fund Compare</span><span class="main-tab-short">Funds</span>
    </button>
    <button class="main-tab" id="mtab-sip" role="tab" aria-selected="false" aria-controls="mpanel-sip" onclick="switchMainTab('sip',this)" title="SIP & Lumpsum Calculator">
      <span class="main-tab-icon">🧮</span><span class="main-tab-label">SIP Calculator</span><span class="main-tab-short">SIP</span>
    </button>
    <button class="main-tab" id="mtab-goal" role="tab" aria-selected="false" aria-controls="mpanel-goal" onclick="switchMainTab('goal',this)" title="Investment Goal Planner">
      <span class="main-tab-icon">🎯</span><span class="main-tab-label">Goal Planner</span><span class="main-tab-short">Goal</span>
    </button>
    <button class="main-tab" id="mtab-swp" role="tab" aria-selected="false" aria-controls="mpanel-swp" onclick="switchMainTab('swp',this)" title="SWP — Systematic Withdrawal Plan">
      <span class="main-tab-icon">💸</span><span class="main-tab-label">SWP</span><span class="main-tab-short">SWP</span>
    </button>
    <button class="main-tab" id="mtab-emi" role="tab" aria-selected="false" aria-controls="mpanel-emi" onclick="switchMainTab('emi',this)" title="EMI & Loan Calculator">
      <span class="main-tab-icon"><span aria-hidden="true">🏦</span></span><span class="main-tab-label">EMI</span><span class="main-tab-short">EMI</span>
    </button>
  </nav>
</div>

<!-- Live region: screen readers announce calc results -->
<div id="a11yLive" aria-live="polite" aria-atomic="true" class="sr-only"></div>

<!-- PANEL: FUND COMPARE -->
<div class="main-panel active" id="mpanel-fund" role="tabpanel" aria-labelledby="mtab-fund">

<!-- ═══ WAR ROOM HERO ═══ -->
<h2 class="sr-only">Mutual Fund Comparison — War Room</h2>
  <div class="wr-hdr">
  <div class="wr-hdr-grid"></div>
  <div class="wr-hdr-orb wr-hdr-orb1"></div>
  <div class="wr-hdr-orb wr-hdr-orb2"></div>
  <div class="wr-hdr-inner">
    <!-- Left: title -->
    <div class="wr-hdr-left">
      <div class="wr-hdr-eyebrow">
        <span class="wr-live-dot"></span>Live AMFI Data · Real-time Analysis
      </div>
      <div class="wr-hdr-title">
        <span class="wr-hdr-icon">⚔️</span>
        <div>
          <div class="wr-hdr-name">Fund Compare — War Room</div>
          <div class="wr-hdr-sub">Side-by-side NAV · Risk · Return · Sharpe analysis</div>
        </div>
      </div>
    </div>
    <!-- Right: live stat chips — populate once funds added -->
    <div class="wr-stat-row" id="wrStatRow">
      <div class="wr-empty-hint" id="wrEmptyHint">
        <span class="wr-pulse-ring"></span>
        Add funds below to activate live battle stats
      </div>
      <div class="wr-stats" id="wrStats" style="display:none"></div>
    </div>
  </div>
  <!-- Radar backdrop SVG -->
  <svg class="wr-radar" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="90" stroke="rgba(255,255,255,.04)" stroke-width="1"/>
    <circle cx="100" cy="100" r="60" stroke="rgba(255,255,255,.04)" stroke-width="1"/>
    <circle cx="100" cy="100" r="30" stroke="rgba(255,255,255,.06)" stroke-width="1"/>
    <line x1="100" y1="10" x2="100" y2="190" stroke="rgba(255,255,255,.03)" stroke-width="1"/>
    <line x1="10" y1="100" x2="190" y2="100" stroke="rgba(255,255,255,.03)" stroke-width="1"/>
    <line x1="27" y1="27" x2="173" y2="173" stroke="rgba(255,255,255,.03)" stroke-width="1"/>
    <line x1="173" y1="27" x2="27" y2="173" stroke="rgba(255,255,255,.03)" stroke-width="1"/>
    <circle cx="100" cy="100" r="4" fill="rgba(102,187,106,.5)"/>
  </svg>
</div>

<!-- SEARCH -->
<div class="search-card">
  <div class="section-label">🔍 Search &amp; Add Funds <span style="font-weight:500;text-transform:none;letter-spacing:0;font-size:.65rem;color:var(--muted)">(up to 5)</span></div>
  <div class="search-wrap">
    <input class="search-input" type="text" id="mfInput"
      placeholder="Search by fund name, AMC or category…"
      oninput="onSearch()" autocomplete="off"
      aria-label="Search mutual funds by name, AMC or category"
      aria-autocomplete="list" aria-controls="dropdown" aria-expanded="false"
      role="combobox">
    <div class="dropdown" id="dropdown" role="listbox" aria-label="Fund search results"></div>
  </div>
  <div class="search-hint">↳ Live search · AMFI registered data via mfapi.in</div>
  <div class="loading-bar" id="loadingBar"><div class="loading-bar-inner"></div></div>
  <div class="chips" id="chips"></div>

  <!-- Quick-add popular funds — dynamically resolved -->
  <div class="quick-add-wrap" id="quickAddWrap">
    <div class="qa-label">⚡ Popular picks — click to add instantly</div>
    <div class="qa-chips" id="qaChips">
      <button class="qa-chip" data-code="125494" data-name="SBI Small Cap Fund - Regular Plan - Growth" data-cat="Small Cap" onclick="qcClick(this)"><span class="qa-chip-name">SBI Small Cap</span></button>
      <button class="qa-chip" data-code="113177" data-name="Nippon India Small Cap Fund - Growth Plan - Growth Option" data-cat="Small Cap" onclick="qcClick(this)"><span class="qa-chip-name">Nippon Small Cap</span></button>
      <button class="qa-chip" data-code="122640" data-name="Parag Parikh Flexi Cap Fund - Regular Plan - Growth" data-cat="Flexi Cap" onclick="qcClick(this)"><span class="qa-chip-name">Parag Parikh Flexi</span></button>
      <button class="qa-chip" data-code="101762" data-name="HDFC Flexi Cap Fund - Growth Plan" data-cat="Flexi Cap" onclick="qcClick(this)"><span class="qa-chip-name">HDFC Flexi Cap</span></button>
      <button class="qa-chip" data-code="140225" data-name="Edelweiss Mid Cap Fund - Regular Plan - Growth Option" data-cat="Mid Cap" onclick="qcClick(this)"><span class="qa-chip-name">Edelweiss Mid Cap</span></button>
      <button class="qa-chip" data-code="105758" data-name="HDFC Mid Cap Fund - Growth Plan" data-cat="Mid Cap" onclick="qcClick(this)"><span class="qa-chip-name">HDFC Mid Cap</span></button>
      <button class="qa-chip" data-code="103131" data-name="HDFC Multi-Asset Fund - Growth Option" data-cat="Multi Asset" onclick="qcClick(this)"><span class="qa-chip-name">HDFC Multi-Asset</span></button>
      <button class="qa-chip" data-code="101072" data-name="quant Multi Asset Allocation Fund-GROWTH OPTION - Regular Plan" data-cat="Multi Asset" onclick="qcClick(this)"><span class="qa-chip-name">Quant Multi Asset</span></button>
      <button class="qa-chip" data-code="108466" data-name="ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)  - Growth" data-cat="Large Cap" onclick="qcClick(this)"><span class="qa-chip-name">ICICI Large Cap</span></button>
      <button class="qa-chip" data-code="103504" data-name="SBI Large Cap FUND-REGULAR PLAN GROWTH" data-cat="Large Cap" onclick="qcClick(this)"><span class="qa-chip-name">SBI Large Cap</span></button>
    </div>
  </div>
</div>

<!-- TOOLBAR -->
<div class="toolbar" id="toolbar" style="display:none">
  <div class="period-row">
    <span class="period-label">Period</span>
    <button class="period-btn" onclick="setPeriod('1M',this)" aria-label="Show 1 month performance">1M</button>
    <button class="period-btn" onclick="setPeriod('3M',this)" aria-label="Show 3 months performance">3M</button>
    <button class="period-btn" onclick="setPeriod('6M',this)" aria-label="Show 6 months performance">6M</button>
    <button class="period-btn active" onclick="setPeriod('1Y',this)" aria-label="Show 1 year performance" aria-pressed="true">1Y</button>
    <button class="period-btn" onclick="setPeriod('2Y',this)" aria-label="Show 2 years performance">2Y</button>
    <button class="period-btn" onclick="setPeriod('3Y',this)" aria-label="Show 3 years performance">3Y</button>
    <button class="period-btn" onclick="setPeriod('5Y',this)" aria-label="Show 5 years performance">5Y</button>
    <button class="period-btn" onclick="setPeriod('10Y',this)" aria-label="Show 10 years performance">10Y</button>
    <button class="period-btn" onclick="setPeriod('MAX',this)" aria-label="Show maximum available history">Max</button>
  </div>
  <button class="export-btn" onclick="exportPDF()" aria-label="Export fund briefing as PDF">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    Export PDF
  </button>
</div>

<!-- TABS -->
<div class="tabs-row" id="tabsRow" style="display:none">
  <button class="tab-btn active" onclick="switchTab('nav',this)" role="tab" aria-selected="true" aria-controls="mainContent">📈 NAV Performance</button>
  <button class="tab-btn" onclick="switchTab('metrics',this)" role="tab" aria-selected="false" aria-controls="mainContent">📊 Fund Metrics</button>
</div>

<!-- FUND CONTENT -->
<div id="mainContent">
  <div class="empty-state" id="emptyState">
    <!-- Animated chart lines -->
    <div class="es-chart">
      <svg viewBox="0 0 280 80" fill="none" xmlns="http://www.w3.org/2000/svg" class="es-svg">
        <polyline class="es-line es-line-1" points="0,65 30,58 60,50 90,42 120,38 150,28 180,22 210,18 240,12 280,8"/>
        <polyline class="es-line es-line-2" points="0,72 30,68 60,62 90,55 120,52 150,46 180,40 210,36 240,30 280,24"/>
        <polyline class="es-line es-line-3" points="0,70 30,72 60,68 90,65 120,60 150,55 180,50 210,46 240,42 280,38"/>
      </svg>
    </div>
    <div class="es-icon">📊</div>
    <div class="empty-title">Compare up to 5 funds side-by-side</div>
    <p class="empty-p">Search above or pick a popular fund below to get started</p>
    <!-- Try-me shortcuts -->
    <div class="es-try-row" id="esTryRow"><span class="es-try-label">Try:</span><button class="es-try-btn" data-c1="125494" data-n1="SBI Small Cap Fund - Regular Plan - Growth" data-c2="113177" data-n2="Nippon India Small Cap Fund - Growth Plan - Growth Option" onclick="tryPairClick(this)">SBI Small Cap vs Nippon Small Cap</button><button class="es-try-btn" data-c1="122640" data-n1="Parag Parikh Flexi Cap Fund - Regular Plan - Growth" data-c2="101762" data-n2="HDFC Flexi Cap Fund - Growth Plan" onclick="tryPairClick(this)">Parag Parikh vs HDFC Flexi Cap</button><button class="es-try-btn" data-c1="140225" data-n1="Edelweiss Mid Cap Fund - Regular Plan - Growth Option" data-c2="105758" data-n2="HDFC Mid Cap Fund - Growth Plan" onclick="tryPairClick(this)">Edelweiss vs HDFC Mid Cap</button></div>
  </div>
</div>


</div>

<!-- PANEL: SIP CALCULATOR -->
<div class="main-panel" id="mpanel-sip" role="tabpanel" aria-labelledby="mtab-sip">
<div class="sip-card sip-split-card">

  <!-- ── WEALTH CLOCK HERO ── -->
  <h2 class="sr-only">SIP & Lumpsum Returns Calculator — Wealth Clock</h2>
  <div class="wc-hdr">
    <div class="wc-hdr-grid"></div>
    <div class="wc-hdr-orb wc-hdr-orb1"></div>
    <div class="wc-hdr-orb wc-hdr-orb2"></div>
    <div class="wc-hdr-inner">

      <!-- Left: title + mode toggle -->
      <div class="wc-hdr-left">
        <div class="wc-eyebrow">
          <span class="wr-live-dot"></span>Compound Growth Engine
        </div>
        <div class="wc-title-row">
          <span class="wc-icon">🕐</span>
          <div>
            <div class="wc-name" id="calcModeTitle">SIP Returns Calculator</div>
            <div class="wc-sub">Model SIP · Lumpsum · Step-up growth scenarios</div>
          </div>
        </div>
        <!-- Mode toggle in hero -->
        <div class="wc-mode-row">
          <div class="sip-mode-toggle">
            <button id="modeSIP"  onclick="setCalcMode('sip')"  class="smt-btn active" role="radio" aria-checked="true"  aria-label="SIP mode">SIP</button>
            <button id="modeLump" onclick="setCalcMode('lump')" class="smt-btn" role="radio" aria-checked="false" aria-label="Lumpsum mode">Lumpsum</button>
            <button id="modeBoth" onclick="setCalcMode('both')" class="smt-btn" role="radio" aria-checked="false" aria-label="SIP plus Lumpsum combined mode">SIP + Lumpsum</button>
            <button id="modeBacktest" onclick="setSIPMode('backtest',this)" class="smt-btn" role="radio" aria-checked="false" aria-label="SIP NAV Backtester">&#x1F4CA; NAV Backtest</button>
          </div>
          <button id="sipPrintBtn" onclick="printCalc()" class="swp-hdr-btn" style="margin-left:auto">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Save PDF
          </button>
        </div>
      </div>

      <!-- Right: Wealth Clock ring -->
      <div class="wc-ring-wrap">
        <svg class="wc-ring-svg" viewBox="0 0 160 160">
          <!-- Track -->
          <circle cx="80" cy="80" r="66" stroke="rgba(255,255,255,.08)" stroke-width="12" fill="none"/>
          <!-- Invested arc (grey) -->
          <circle cx="80" cy="80" r="66" stroke="rgba(255,255,255,.18)" stroke-width="12" fill="none"
            stroke-dasharray="414.69" stroke-dashoffset="0"
            stroke-linecap="round" transform="rotate(-90 80 80)"
            id="wcRingInvested"/>
          <!-- Gain arc (green) -->
          <circle cx="80" cy="80" r="66" stroke="#66bb6a" stroke-width="12" fill="none"
            stroke-dasharray="414.69" stroke-dashoffset="414.69"
            stroke-linecap="round" transform="rotate(-90 80 80)"
            id="wcRingGain" style="transition:stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)"/>
          <!-- Glow -->
          <circle cx="80" cy="80" r="66" stroke="#a5d6a7" stroke-width="2" fill="none"
            stroke-dasharray="414.69" stroke-dashoffset="414.69"
            stroke-linecap="round" transform="rotate(-90 80 80)"
            id="wcRingGlow" style="transition:stroke-dashoffset .8s cubic-bezier(.4,0,.2,1);filter:blur(2px);opacity:.5"/>
        </svg>
        <div class="wc-ring-center">
          <div class="wc-ring-label">Returns</div>
          <div class="wc-ring-pct" id="wcRingPct">—%</div>
          <div class="wc-ring-sublabel">of corpus</div>
        </div>
      </div>

    </div>
  </div>

  <!-- ── SPLIT BODY ── -->
  <div class="sip-split-body">

    <!-- ══ LEFT: Inputs ══ -->
    <div class="sip-left">

      <!-- SIP Amount -->
      <div class="sip-field sip-only">
        <label class="sif-solo-label" for="sipAmount">SIP Amount</label>
        <div class="sip-stepper">
          <button class="stp-btn" onclick="stepField('sipAmount',-500,1,999999);calcSIP()" aria-label="Decrease SIP amount by 500">−</button>
          <div class="stp-input-wrap">
            <span class="stp-prefix">₹</span>
            <input class="stp-input" id="sipAmount" type="number" value="10000" min="1" step="100" oninput="dCalcSIP()">
          </div>
          <button class="stp-btn" onclick="stepField('sipAmount',500,1,999999);calcSIP()" aria-label="Increase SIP amount by 500">+</button>
        </div>
        <div class="stp-hints">
          <button class="stp-hint" onclick="setField('sipAmount',1000);calcSIP()">₹1K</button>
          <button class="stp-hint" onclick="setField('sipAmount',5000);calcSIP()">₹5K</button>
          <button class="stp-hint" onclick="setField('sipAmount',10000);calcSIP()">₹10K</button>
          <button class="stp-hint" onclick="setField('sipAmount',25000);calcSIP()">₹25K</button>
          <button class="stp-hint" onclick="setField('sipAmount',50000);calcSIP()">₹50K</button>
        </div>
      </div>

      <!-- Lumpsum Amount -->
      <div class="sip-field lump-only" style="display:none">
        <label class="sif-solo-label" for="lumpAmount">Lumpsum Amount</label>
        <div class="sip-stepper">
          <button class="stp-btn" onclick="stepField('lumpAmount',-10000,0,99999999);calcSIP()" aria-label="Decrease lumpsum by 10000">−</button>
          <div class="stp-input-wrap">
            <span class="stp-prefix">₹</span>
            <input class="stp-input" id="lumpAmount" type="number" value="100000" min="0" step="1000" oninput="dCalcSIP()">
          </div>
          <button class="stp-btn" onclick="stepField('lumpAmount',10000,0,99999999);calcSIP()" aria-label="Increase lumpsum by 10000">+</button>
        </div>
        <div class="stp-hints">
          <button class="stp-hint" onclick="setField('lumpAmount',50000);calcSIP()">₹50K</button>
          <button class="stp-hint" onclick="setField('lumpAmount',100000);calcSIP()">₹1L</button>
          <button class="stp-hint" onclick="setField('lumpAmount',500000);calcSIP()">₹5L</button>
          <button class="stp-hint" onclick="setField('lumpAmount',1000000);calcSIP()">₹10L</button>
        </div>
      </div>

      <!-- SIP Frequency -->
      <div class="sip-field sip-only">
        <label class="sif-solo-label" for="sipFreq">SIP Frequency</label>
        <select class="sip-select" id="sipFreq" onchange="calcSIP()">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly" selected>Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annually">Annually</option>
        </select>
      </div>

      <!-- Duration -->
      <div class="sip-field">
        <label class="sif-solo-label" for="sipDuration">Duration</label>
        <div class="sip-stepper">
          <button class="stp-btn" onclick="stepField('sipDuration',-1,1,99);calcSIP()" aria-label="Decrease duration by 1">−</button>
          <div class="stp-input-wrap">
            <input class="stp-input" id="sipDuration" type="number" value="10" min="1" step="1" oninput="dCalcSIP()" style="text-align:center">
            <select class="stp-unit-select" id="sipDurationUnit" onchange="calcSIP()">
              <option value="years" selected>Yrs</option>
              <option value="months">Mo</option>
            </select>
          </div>
          <button class="stp-btn" onclick="stepField('sipDuration',1,1,99);calcSIP()" aria-label="Increase duration by 1">+</button>
        </div>
        <div class="stp-hints">
          <button class="stp-hint" onclick="setField('sipDuration',3);setUnit('sipDurationUnit','years');calcSIP()">3Y</button>
          <button class="stp-hint" onclick="setField('sipDuration',5);setUnit('sipDurationUnit','years');calcSIP()">5Y</button>
          <button class="stp-hint" onclick="setField('sipDuration',10);setUnit('sipDurationUnit','years');calcSIP()">10Y</button>
          <button class="stp-hint" onclick="setField('sipDuration',15);setUnit('sipDurationUnit','years');calcSIP()">15Y</button>
          <button class="stp-hint" onclick="setField('sipDuration',20);setUnit('sipDurationUnit','years');calcSIP()">20Y</button>
        </div>
      </div>

      <!-- Expected Return -->
      <div class="sip-field">
        <label class="sif-solo-label" for="sipRate">Expected Return (% p.a.)</label>
        <div class="sip-stepper">
          <button class="stp-btn" onclick="stepField('sipRate',-0.5,1,50);calcSIP()" aria-label="Decrease return rate by 0.5%">−</button>
          <div class="stp-input-wrap">
            <input class="stp-input" id="sipRate" type="number" value="12" min="0.1" max="100" step="0.1" oninput="dCalcSIP()" style="text-align:center">
            <span class="stp-suffix">%</span>
          </div>
          <button class="stp-btn" onclick="stepField('sipRate',0.5,1,50);calcSIP()" aria-label="Increase return rate by 0.5%">+</button>
        </div>
        <div class="stp-hints">
          <button class="stp-hint" onclick="setField('sipRate',8);calcSIP()">8%</button>
          <button class="stp-hint" onclick="setField('sipRate',10);calcSIP()">10%</button>
          <button class="stp-hint" onclick="setField('sipRate',12);calcSIP()">12%</button>
          <button class="stp-hint" onclick="setField('sipRate',15);calcSIP()">15%</button>
        </div>
      </div>

      <!-- Step-up -->
      <div class="sip-field sip-only">
        <label class="sif-solo-label" for="sipStepup">Annual Step-up (%)</label>
        <div class="sip-stepper">
          <button class="stp-btn" onclick="stepField('sipStepup',-1,0,30);calcSIP()" aria-label="Decrease step-up by 1%">−</button>
          <div class="stp-input-wrap">
            <input class="stp-input" id="sipStepup" type="number" value="0" min="0" max="50" step="1" oninput="dCalcSIP()" style="text-align:center">
            <span class="stp-suffix">%</span>
          </div>
          <button class="stp-btn" onclick="stepField('sipStepup',1,0,30);calcSIP()" aria-label="Increase step-up by 1%">+</button>
        </div>
        <div class="stp-hints">
          <button class="stp-hint" onclick="setField('sipStepup',0);calcSIP()">0%</button>
          <button class="stp-hint" onclick="setField('sipStepup',5);calcSIP()">5%</button>
          <button class="stp-hint" onclick="setField('sipStepup',10);calcSIP()">10%</button>
          <button class="stp-hint" onclick="setField('sipStepup',15);calcSIP()">15%</button>
        </div>
      </div>

    </div><!-- /.sip-left -->

    <!-- ══ RIGHT: Results ══ -->
    <div class="sip-right">

      <!-- Big corpus display -->
      <div class="sip-big-result" id="sipBigResult">
        <div class="sbr-eyebrow">Estimated Corpus (Base Case)</div>
        <div class="sbr-corpus" id="sbrCorpus">₹—</div>
        <div class="sbr-sub-row">
          <span class="sbr-chip sbr-invested" id="sbrInvested">Invested: —</span>
          <span class="sbr-chip sbr-gain" id="sbrGain">Gain: —</span>
          <span class="sbr-chip sbr-mult" id="sbrMult">—×</span>
        </div>
        <!-- Insight sentence -->
        <div class="sbr-insight" id="sbrInsight"></div>
        <!-- Stacked bar -->
        <div class="sbr-bar-wrap">
          <div class="sbr-bar-invested" id="sbrBarInvested" style="width:50%"></div>
          <div class="sbr-bar-gain"     id="sbrBarGain"     style="width:50%"></div>
        </div>
        <div class="sbr-bar-labels">
          <span>Invested</span><span>Wealth Gained</span>
        </div>
      </div>

      <!-- Summary strip -->
      <div class="sip-summary" id="sipSummary"></div>

      <!-- Scenario cards -->
      <div class="sip-results-grid" id="sipResultCards"></div>

      <!-- Chart -->
      <div class="sip-chart-wrap"><canvas id="sipChart" role="img" aria-label="SIP growth chart showing corpus breakdown over time"></canvas></div>

    </div><!-- /.sip-right -->
  </div><!-- /.sip-split-body -->
</div><!-- /.sip-split-card -->

  <!-- SIP NAV BACKTESTER PANEL -->
  <div id="sipBTPanel" class="sip-card-body" style="display:none;padding:22px 26px 28px;overflow:visible">
    <div class="swp-section-head">📊 SIP NAV Backtester — Real Fund Data</div>
    <div class="swp-params">
      <div class="sip-field" style="grid-column:1/-1;position:relative">
        <label>Search Fund</label>
        <input class="search-input" id="sipBTFundInput" type="text" placeholder="Type fund name or AMC…"
          autocomplete="off" oninput="sipBTOnSearch(this.value)" onclick="this.select()">
        <div class="dropdown" id="sipBTDropdown" style="position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:2000"></div>
        <div id="sipBTFundChipWrap" style="display:none;margin-top:10px">
          <span class="chip chip-0">
            <span class="chip-name" id="sipBTFundName"></span>
            <button class="chip-remove" onclick="sipBTClearFund()" aria-label="Remove fund">✕</button>
          </span>
        </div>
        <div id="sipBTEmpty" style="color:var(--muted);font-size:.78rem;margin-top:10px">Search for a fund to begin the SIP backtest</div>
      </div>
    </div>
    <div class="swp-params" style="margin-top:14px">
      <div class="sip-field">
        <label>Monthly SIP (₹)</label>
        <div class="sip-stepper">
          <button class="stp-btn" onclick="sipBTStep('sipBTAmount',-1000,500,1000000)">−</button>
          <div class="stp-input-wrap"><span class="stp-prefix">₹</span>
            <input class="stp-input" id="sipBTAmount" type="number" value="10000" min="500" max="1000000" oninput="dSipBTRun()">
          </div>
          <button class="stp-btn" onclick="sipBTStep('sipBTAmount',1000,500,1000000)">+</button>
        </div>
      </div>
      <div class="sip-field">
        <label>Step-up (% p.a.)</label>
        <div class="sip-stepper">
          <button class="stp-btn" onclick="sipBTStep('sipBTStepup',-1,0,30)">−</button>
          <div class="stp-input-wrap">
            <input class="stp-input" id="sipBTStepup" type="number" value="0" min="0" max="30" style="text-align:center" oninput="dSipBTRun()">
            <span class="stp-suffix">%</span>
          </div>
          <button class="stp-btn" onclick="sipBTStep('sipBTStepup',1,0,30)">+</button>
        </div>
      </div>
      <div class="sip-field">
        <label>Start Month</label>
        <select class="sip-select" id="sipBTStartMonth" onchange="dSipBTRun()"></select>
      </div>
      <div class="sip-field">
        <label>Start Year</label>
        <select class="sip-select" id="sipBTStartYear" onchange="sipBTUpdateMonths();dSipBTRun()"></select>
      </div>
      <div class="sip-field">
        <label>End Month</label>
        <select class="sip-select" id="sipBTEndMonth" onchange="dSipBTRun()"></select>
      </div>
      <div class="sip-field">
        <label>End Year</label>
        <select class="sip-select" id="sipBTEndYear" onchange="sipBTUpdateEndMonths();dSipBTRun()"></select>
      </div>
    </div>
    <div id="sipBTResults" style="display:none;margin-top:18px">
      <div id="sipBTActions" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <button onclick="sipBTShareURL()" style="flex:1;min-width:120px;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 16px;border:1.5px solid var(--g-light);border-radius:9px;background:var(--g-xlight);color:var(--g1);font-family:'Raleway',sans-serif;font-size:.7rem;font-weight:700;cursor:pointer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share URL</button>
        <button onclick="sipBTPrint()" style="flex:1;min-width:120px;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 16px;border:1.5px solid var(--g-light);border-radius:9px;background:var(--g1);color:#fff;font-family:'Raleway',sans-serif;font-size:.7rem;font-weight:700;cursor:pointer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Save PDF</button>
      </div>
      <div id="sipBTStatGrid" class="swp-stat-grid" style="margin-bottom:18px"></div>
      <div id="sipBTResultCards" class="swp-result-grid" style="margin-bottom:18px"></div>
      <div id="sipBTWhatIfWrap" style="margin-bottom:18px">
        <div class="swp-section-head" style="margin-bottom:10px">📅 What-If: Different Start Years</div>
        <div id="sipBTWhatIfBars"></div>
      </div>
      <div class="swp-section-head" style="margin-bottom:10px">📈 Corpus Growth Chart</div>
      <div style="height:300px;position:relative"><canvas id="sipBTChart"></canvas></div>
    </div>
  </div>

</div>
<!-- PANEL: GOAL PLANNER -->
<div class="main-panel" id="mpanel-goal" role="tabpanel" aria-labelledby="mtab-goal">
<!-- GOAL PLANNER -->
<div class="sip-card" id="goalPlannerCard">

  <!-- ═══ MISSION CONTROL HERO ═══ -->
  <h2 class="sr-only">Investment Goal Planner — Mission Control</h2>
  <div class="mc-hdr">
    <div class="mc-hdr-grid"></div>
    <div class="mc-hdr-orb mc-hdr-orb1"></div>
    <div class="mc-hdr-orb mc-hdr-orb2"></div>
    <!-- Starfield -->
    <div class="mc-stars" id="mcStars"></div>

    <div class="mc-hdr-inner">
      <!-- Left: title + eyebrow + mode row -->
      <div class="mc-hdr-left">
        <div class="mc-eyebrow">
          <span class="wr-live-dot" style="background:#81d4fa;box-shadow:none"></span>
          Reverse Calculator · Mission Control
        </div>
        <div class="mc-title-row">
          <span class="mc-icon">🚀</span>
          <div>
            <div class="mc-name" id="mcHdrTitle">Investment Goal Planner</div>
            <div class="mc-sub">How much SIP · Lumpsum · Time needed to hit your target</div>
          </div>
        </div>
        <div class="mc-mode-row">
          <button onclick="printGoalPlan()" class="swp-hdr-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Save PDF
          </button>
        </div>
      </div>

      <!-- Right: live result box -->
      <div class="mc-hdr-right">
        <div class="mc-result-box">
          <div class="mc-result-label">Monthly SIP Required</div>
          <div class="mc-result-val" id="mcHdrSIP">₹—</div>
          <div class="mc-result-sub" id="mcHdrSub">Enter your goal to launch</div>
        </div>
      </div>
    </div>

    <!-- Orbit trajectory SVG -->
    <svg class="mc-orbit-svg" viewBox="0 0 160 110" fill="none">
      <path d="M10,100 Q40,20 90,40 T150,10" stroke="rgba(100,181,246,.4)" stroke-width="1.5" stroke-dasharray="5 4"/>
      <circle cx="150" cy="10" r="5" fill="rgba(100,181,246,.6)"/>
      <circle cx="90" cy="40" r="3" fill="rgba(100,181,246,.3)"/>
      <circle cx="40" cy="66" r="2" fill="rgba(100,181,246,.2)"/>
      <!-- Rocket dot -->
      <circle cx="150" cy="10" r="8" fill="none" stroke="rgba(100,181,246,.25)" stroke-width="1">
        <animate attributeName="r" values="8;14;8" dur="2.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="1;0;1" dur="2.5s" repeatCount="indefinite"/>
      </circle>
    </svg>
  </div>
  <div class="sip-card-body">
    <!-- Goal Preset Icon Cards -->
    <div class="gp-presets-section">
      <div class="section-label" style="margin-bottom:14px">🎯 What are you saving for?</div>
      <div class="gp-preset-cards" id="goalPresets">
        <button class="gp-preset-card active" onclick="applyGoalPreset(this,'child_edu')">
          <span class="gppc-icon">🎓</span>
          <span class="gppc-name">Child Education</span>
          <span class="gppc-hint">₹25L–₹1Cr · 10–18Y</span>
        </button>
        <button class="gp-preset-card" onclick="applyGoalPreset(this,'retirement')">
          <span class="gppc-icon">🏖️</span>
          <span class="gppc-name">Retirement</span>
          <span class="gppc-hint">₹2Cr+ · 20–30Y</span>
        </button>
        <button class="gp-preset-card" onclick="applyGoalPreset(this,'home')">
          <span class="gppc-icon">🏠</span>
          <span class="gppc-name">Home Purchase</span>
          <span class="gppc-hint">₹50L–₹2Cr · 5–10Y</span>
        </button>
        <button class="gp-preset-card" onclick="applyGoalPreset(this,'emergency')">
          <span class="gppc-icon">🛡️</span>
          <span class="gppc-name">Emergency Fund</span>
          <span class="gppc-hint">3–6 months · 1–2Y</span>
        </button>
        <button class="gp-preset-card" onclick="applyGoalPreset(this,'travel')">
          <span class="gppc-icon">✈️</span>
          <span class="gppc-name">Dream Vacation</span>
          <span class="gppc-hint">₹2L–₹10L · 2–5Y</span>
        </button>
        <button class="gp-preset-card" onclick="applyGoalPreset(this,'car')">
          <span class="gppc-icon">🚗</span>
          <span class="gppc-name">Car Purchase</span>
          <span class="gppc-hint">₹5L–₹30L · 3–5Y</span>
        </button>
        <button class="gp-preset-card" onclick="applyGoalPreset(this,'custom')">
          <span class="gppc-icon">✏️</span>
          <span class="gppc-name">Custom Goal</span>
          <span class="gppc-hint">Set your own target</span>
        </button>
      </div>
    </div>

    <!-- North Star Banner -->
    <div class="gp-north-star" id="gpNorthStar">
      <div class="gpns-icon">🌟</div>
      <div class="gpns-text">
        <div class="gpns-label">Your Goal</div>
        <div class="gpns-sentence" id="gpNorthStarText">Planning your Child Education Fund of ₹20L in 15 years</div>
      </div>
    </div>
    <!-- Inputs Grid -->
    <div class="sip-params" style="margin-bottom:20px">
      <div class="sip-field">
        <label>Goal Name</label>
        <input class="sip-input" id="goalName" type="text" value="Child Education Fund" oninput="dCalcGoal()" style="font-family:'Raleway',sans-serif;font-size:.85rem">
      </div>
      <div class="sip-field">
        <label>Target Amount (₹)</label>
        <input class="sip-input" id="goalAmount" type="number" value="2000000" min="1000" step="10000" oninput="dCalcGoal()">
      </div>
      <div class="sip-field">
        <label>Time Horizon</label>
        <div class="dur-row">
          <input class="sip-input" id="goalDuration" type="number" value="15" min="1" step="1" oninput="dCalcGoal()">
          <select class="sip-select" id="goalDurationUnit" onchange="calcGoal()">
            <option value="years" selected>Years</option>
            <option value="months">Months</option>
          </select>
        </div>
      </div>
      <div class="sip-field">
        <label>Expected Return (% p.a.)</label>
        <input class="sip-input" id="goalRate" type="number" value="12" min="1" max="100" step="0.5" oninput="dCalcGoal()">
      </div>
      <div class="sip-field">
        <label>Existing Investments (₹)</label>
        <input class="sip-input" id="goalExisting" type="number" value="0" min="0" step="1000" oninput="dCalcGoal()" placeholder="0">
      </div>
      <div class="sip-field">
        <label>Inflation Adjustment (% p.a.)</label>
        <input class="sip-input" id="goalInflation" type="number" value="6" min="0" max="30" step="0.5" oninput="dCalcGoal()">
      </div>
    </div>
    <!-- Advanced Toggle -->
    <div style="margin-bottom:18px">
      <button onclick="toggleGoalAdvanced()" id="goalAdvToggle" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:1.5px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--muted);font-family:'Raleway',sans-serif;font-size:.72rem;font-weight:700;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='var(--g3)';this.style.color='var(--g2)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)'">
        <svg id="goalAdvArrow" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>
        Advanced Options
      </button>
      <div id="goalAdvanced" style="display:none;margin-top:14px">
        <div class="sip-params">
          <div class="sip-field">
            <label>SIP Frequency</label>
            <select class="sip-select" id="goalFreq" onchange="calcGoal()">
              <option value="monthly" selected>Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="weekly">Weekly</option>
              <option value="annually">Annually</option>
            </select>
          </div>
          <div class="sip-field">
            <label>Annual SIP Step-up (%)</label>
            <input class="sip-input" id="goalStepup" type="number" value="10" min="0" max="50" step="1" oninput="dCalcGoal()">
          </div>
          <div class="sip-field">
            <label>Lumpsum % in Hybrid Plan</label>
            <input class="sip-input" id="goalLumpsumPct" type="number" value="30" min="0" max="100" step="5" oninput="dCalcGoal()">
          </div>
        </div>
      </div>
    </div>
    <!-- Goal Summary Banner -->
    <div id="goalSummaryBanner" style="margin-bottom:20px"></div>
    <!-- Three Plan Cards -->
    <div class="section-label" style="margin-bottom:12px">📋 Your Investment Roadmap</div>
    <div id="goalPlanCards" class="gp-cards-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:26px"></div>
    <!-- Progress Timeline -->
    <div class="goal-timeline-wrap"><div id="goalTimeline" style="margin-bottom:24px"></div></div
    <!-- Projection Chart -->
    <div class="sip-chart-wrap" style="height:320px"><canvas id="goalChart" role="img" aria-label="Goal planning chart showing required investment growth over time"></canvas></div>
  </div>
</div>


</div>

<!-- PANEL: SWP CALCULATOR -->
<div class="main-panel" id="mpanel-swp" role="tabpanel" aria-labelledby="mtab-swp">
<!-- SWP CARD -->
<div class="swp-card" id="swpCard">

  <!-- ═══ DARK HEADER ═══ -->
  <h2 class="sr-only">Systematic Withdrawal Plan (SWP) Calculator</h2>
  <div class="swp-hdr">
    <div class="swp-hdr-grid"></div>
    <div class="swp-hdr-orb swp-hdr-orb1"></div>
    <div class="swp-hdr-orb swp-hdr-orb2"></div>
    <div class="swp-hdr-top">
      <div class="swp-hdr-title">
        <div class="swp-hdr-icon">💸</div>
        <div>
          <div class="swp-hdr-name">Systematic Withdrawal Plan</div>
          <div class="swp-hdr-sub">Income Engine · Retirement Payout Modeller</div>
        </div>
        <div class="swp-hdr-badge">Live Calculator</div>
      </div>
      <button class="swp-hdr-btn" id="swpPrintBtn" onclick="printSWP()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Save PDF
      </button>
    </div>
    <div class="swp-mode-row">
      <div class="swp-mode-desc">Plan your retirement income — model how long your corpus lasts, or find how much corpus you need for a target payout. Add a delay period to let your corpus keep compounding before withdrawals begin.</div>
      <div class="swp-mode-tabs">
        <button class="swp-mode-tab active" onclick="setSWPMode('haveCorpus',this)" role="tab" aria-selected="true">I Have a Corpus</button>
        <button class="swp-mode-tab" onclick="setSWPMode('needIncome',this)" role="tab" aria-selected="false">I Need ₹X/Month</button>
        <button class="swp-mode-tab" onclick="setSWPMode('backtest',this)" role="tab" aria-selected="false">📊 NAV Backtester</button>
      </div>
    </div>
  </div>

  <!-- ═══ BODY ═══ -->
  <div class="swp-body">

    <!-- Phase Journey Strip -->
    <div class="swp-journey" id="swpJourney">
      <div class="swp-journey-phase phase-corpus">
        <div class="swp-journey-phase-icon">📈</div>
        <div class="swp-journey-phase-body">
          <div class="swp-journey-lbl">Starting Corpus</div>
          <div class="swp-journey-val" id="swpJourneyCorpus">₹50,00,000</div>
          <div class="swp-journey-note" id="swpJourneyCorpusNote">Initial investment</div>
        </div>
      </div>
      <div class="swp-journey-arrow delay-arrow" id="swpJourneyArrow1">→</div>
      <div class="swp-journey-phase phase-delay" id="swpJourneyDelay">
        <div class="swp-journey-phase-icon">⏳</div>
        <div class="swp-journey-phase-body">
          <div class="swp-journey-lbl">After Delay</div>
          <div class="swp-journey-val" id="swpJourneyDelayVal">—</div>
          <div class="swp-journey-note" id="swpJourneyDelayNote">Corpus grows</div>
        </div>
      </div>
      <div class="swp-journey-arrow">→</div>
      <div class="swp-journey-phase phase-withdraw">
        <div class="swp-journey-phase-icon">💸</div>
        <div class="swp-journey-phase-body">
          <div class="swp-journey-lbl">Withdrawal</div>
          <div class="swp-journey-val" id="swpJourneyWithdraw">—</div>
          <div class="swp-journey-note" id="swpJourneyWithdrawNote">Monthly payout</div>
        </div>
      </div>
    </div>

    <!-- ─── MODE A: Have a Corpus ─── -->
    <div id="swpPanelCorpus" class="swp-phase-panel active">
      <div class="swp-section-head">⚙️ Corpus & Withdrawal Settings</div>
      <div class="swp-params">
        <div class="sip-field">
          <label>Initial Corpus (₹)</label>
          <input class="sip-input" id="swpCorpus" type="number" value="5000000" min="10000" step="10000" oninput="dCalcSWP()">
        </div>
        <div class="sip-field">
          <label>Monthly Withdrawal (₹)</label>
          <input class="sip-input" id="swpWithdrawal" type="number" value="30000" min="100" step="500" oninput="dCalcSWP()">
        </div>
        <div class="sip-field">
          <label>Expected Return (% p.a.)</label>
          <input class="sip-input" id="swpRate" type="number" value="10" min="0.1" max="50" step="0.5" oninput="dCalcSWP()">
        </div>
        <div class="sip-field">
          <label>Withdrawal Duration</label>
          <div class="dur-row">
            <input class="sip-input" id="swpDuration" type="number" value="20" min="1" step="1" oninput="dCalcSWP()">
            <select class="sip-select" id="swpDurationUnit" onchange="calcSWP()">
              <option value="years" selected>Years</option>
              <option value="months">Months</option>
            </select>
          </div>
        </div>
        <div class="sip-field">
          <label>Withdrawal Frequency</label>
          <select class="sip-select" id="swpFreq" onchange="calcSWP()">
            <option value="monthly" selected>Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annually">Annually</option>
          </select>
        </div>
        <div class="sip-field">
          <label>Annual Step-up (%)</label>
          <input class="sip-input" id="swpStepup" type="number" value="0" min="0" max="20" step="1" oninput="dCalcSWP()" title="Annual increase in withdrawal to beat inflation">
        </div>
        <div class="sip-field">
          <label>Inflation (% p.a.)</label>
          <input class="sip-input" id="swpInflation" type="number" value="6" min="0" max="20" step="0.5" oninput="dCalcSWP()">
        </div>
      </div>
    </div>

    <!-- ─── MODE B: Need X/Month ─── -->
    <div id="swpPanelIncome" class="swp-phase-panel">
      <div class="swp-section-head">🎯 Target Income Settings</div>
      <div class="swp-params">
        <div class="sip-field">
          <label>Desired Monthly Income (₹)</label>
          <input class="sip-input" id="swpTargetIncome" type="number" value="50000" min="100" step="1000" oninput="dCalcSWP()">
        </div>
        <div class="sip-field">
          <label>Income Duration</label>
          <div class="dur-row">
            <input class="sip-input" id="swpTargetDuration" type="number" value="25" min="1" step="1" oninput="dCalcSWP()">
            <select class="sip-select" id="swpTargetDurationUnit" onchange="calcSWP()">
              <option value="years" selected>Years</option>
              <option value="months">Months</option>
            </select>
          </div>
        </div>
        <div class="sip-field">
          <label>Expected Return (% p.a.)</label>
          <input class="sip-input" id="swpTargetRate" type="number" value="10" min="0.1" max="50" step="0.5" oninput="dCalcSWP()">
        </div>
        <div class="sip-field">
          <label>Withdrawal Frequency</label>
          <select class="sip-select" id="swpTargetFreq" onchange="calcSWP()">
            <option value="monthly" selected>Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annually">Annually</option>
          </select>
        </div>
        <div class="sip-field">
          <label>Annual Step-up (%)</label>
          <input class="sip-input" id="swpTargetStepup" type="number" value="0" min="0" max="20" step="1" oninput="dCalcSWP()">
        </div>
        <div class="sip-field">
          <label>Inflation (% p.a.)</label>
          <input class="sip-input" id="swpTargetInflation" type="number" value="6" min="0" max="20" step="0.5" oninput="dCalcSWP()">
        </div>
      </div>
    </div>

      <!-- ═══ BACKTESTER PANEL ═══ -->
      <div id="swpPanelBacktest" class="swp-phase-panel">
        <div class="swp-section-head">📊 NAV Backtester — Real Fund Data</div>
        <div class="swp-params">
          <div class="sip-field" style="grid-column:1/-1;position:relative">
            <label>Search Fund</label>
            <input class="sip-input" id="btFundInput" type="text" placeholder="Type fund name…" autocomplete="off" oninput="btOnSearch(this.value)">
            <div id="btDropdown" class="dropdown" style="position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:2000"></div>
          </div>
          <div class="sip-field" style="grid-column:1/-1;display:none" id="btFundChipWrap">
            <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:var(--g-xlight);border:1.5px solid var(--g-light);border-radius:20px;font-size:.72rem;font-weight:700;color:var(--g2)">
              <span id="btFundName">—</span>
              <span onclick="btClearFund()" style="cursor:pointer;color:var(--muted);font-size:.85rem;line-height:1">✕</span>
            </div>
          </div>
          <div class="sip-field">
            <label>Initial Corpus (₹)</label>
            <input class="sip-input" id="btCorpus" type="number" value="5000000" min="10000" step="10000" oninput="dBtRun()">
          </div>
          <div class="sip-field">
            <label>Monthly Withdrawal (₹)</label>
            <input class="sip-input" id="btWithdrawal" type="number" value="30000" min="100" step="500" oninput="dBtRun()">
          </div>
          <div class="sip-field">
            <label>Annual Step-up (%)</label>
            <input class="sip-input" id="btStepup" type="number" value="0" min="0" max="30" step="0.5" oninput="dBtRun()">
          </div>
          <div class="sip-field">
            <label>Inflation Rate (%)</label>
            <input class="sip-input" id="btInflation" type="number" value="6" min="0" max="15" step="0.5" oninput="dBtRun()">
          </div>
          <div class="sip-field">
            <label>Start Month</label>
            <select class="sip-input" id="btStartMonth" onchange="dBtRun()"></select>
          </div>
          <div class="sip-field">
            <label>Start Year</label>
            <select class="sip-input" id="btStartYear" onchange="btUpdateMonths();dBtRun()"></select>
          </div>
          <div class="sip-field">
            <label>End Month</label>
            <select class="sip-input" id="btEndMonth" onchange="dBtRun()"></select>
          </div>
          <div class="sip-field">
            <label>End Year</label>
            <select class="sip-input" id="btEndYear" onchange="btUpdateEndMonths();dBtRun()"></select>
          </div>
        </div>

        <!-- Delay toggle -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(0,105,92,.08);border-radius:9px;margin-top:10px;cursor:pointer" onclick="btToggleDelay()">
          <div>
            <div style="font-size:.72rem;font-weight:800;color:var(--g2)">⏳ Delay Period (Accumulation Phase)</div>
            <div style="font-size:.62rem;color:var(--muted);margin-top:2px">Corpus stays invested — grows at actual NAVs before withdrawals start</div>
          </div>
          <label class="swp-delay-toggle" onclick="event.stopPropagation()">
            <input type="checkbox" id="btDelayToggle" onchange="btToggleDelay()">
            <span class="swp-delay-slider"></span>
          </label>
        </div>
        <div id="btDelayPanel" style="display:none;margin-top:8px">
          <div class="swp-params" style="padding:0">
            <div class="sip-field">
              <label>Delay Duration</label>
              <input class="sip-input" id="btDelayVal" type="number" value="3" min="1" max="30" step="1" oninput="dBtRun()">
            </div>
            <div class="sip-field">
              <label>Unit</label>
              <select class="sip-input" id="btDelayUnit" onchange="dBtRun()">
                <option value="years">Years</option>
                <option value="months">Months</option>
              </select>
            </div>
          </div>
          <div style="font-size:.62rem;color:var(--muted);margin-top:6px;padding:0 2px">
            Units accumulate at real NAV movements during delay. Withdrawal starts after delay ends.
          </div>
        </div>
        <div id="btEmpty" style="text-align:center;padding:32px 0;color:var(--muted);font-size:.8rem;display:block">
          Search and select a fund to run the backtest
        </div>

        <!-- ─── BACKTESTER OWN RESULTS ─── -->
        <div id="btResults" style="display:none">

          <!-- Action buttons at top of results -->
          <div id="btActions" style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
            <button onclick="btShareURL()" style="flex:1;min-width:120px;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 16px;border:1.5px solid var(--g-light);border-radius:9px;background:var(--g-xlight);color:var(--g1);font-family:'Raleway',sans-serif;font-size:.7rem;font-weight:700;cursor:pointer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Share URL
            </button>
            <button onclick="btPrint()" style="flex:1;min-width:120px;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 16px;border:1.5px solid var(--g-light);border-radius:9px;background:var(--g1);color:#fff;font-family:'Raleway',sans-serif;font-size:.7rem;font-weight:700;cursor:pointer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Save PDF
            </button>
          </div>
          <!-- Fuel gauge -->
          <div class="swp-fuel" id="btFuel">
            <div class="swp-fuel-label">🔋 Corpus Health Monitor</div>
            <div class="swp-fuel-track"><div class="swp-fuel-fill" id="btFuelFill" style="width:0%"></div></div>
            <div class="swp-fuel-bottom">
              <div class="swp-fuel-stats" id="btFuelStats"></div>
              <div class="swp-fuel-pct" id="btFuelPct">0%</div>
            </div>
          </div>

          <!-- Stat grid -->
          <div class="swp-stat-grid" id="btStatGrid" class="swp-stat-grid" style="margin-top:14px"></div>

          <!-- Result cards -->
          <div class="swp-result-grid" id="btResultCards" class="swp-result-grid" style="margin-top:14px"></div>

          <!-- What-if -->
          <div id="btWhatIfWrap" style="display:none;margin-top:16px">
            <div class="swp-section-head" style="margin-bottom:10px">🔀 What-if: Same inputs, 3 different start years</div>
            <div id="btWhatIfBars"></div>
          </div>

          <!-- Chart -->
          <div style="margin-top:14px">
            <div class="swp-section-head" style="margin-bottom:10px">📈 Corpus vs Withdrawals — Real NAV Data</div>
            <div style="position:relative;height:260px">
              <canvas id="btChart"></canvas>
            </div>
          </div>
        </div>
      </div>


    <!-- ─── DELAY PERIOD BOX (shared) ─── -->
    <div class="swp-delay-box off" id="swpDelayBox">
      <div class="swp-delay-top">
        <div class="swp-delay-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ⏳ Delay Period — Corpus Keeps Growing
        </div>
        <label class="swp-delay-toggle">
          <input type="checkbox" id="swpDelayToggle" onchange="toggleSWPDelay()">
          <span class="swp-delay-slider"></span>
        </label>
      </div>
      <div class="swp-delay-hint" id="swpDelayHint">Enable to defer withdrawals — your corpus compounds at a (possibly higher) pre-withdrawal return before payouts begin. Enter delay in months or years.</div>
      <div class="swp-delay-fields" id="swpDelayFields">
        <div class="sip-field">
          <label>Delay Duration</label>
          <div class="dur-row">
            <input class="sip-input" id="swpDelay" type="number" value="5" min="1" step="1" oninput="dCalcSWP()">
            <select class="sip-select" id="swpDelayUnit" onchange="calcSWP()">
              <option value="years" selected>Years</option>
              <option value="months">Months</option>
            </select>
          </div>
        </div>
        <div class="sip-field">
          <label>Pre-withdrawal Return (% p.a.)</label>
          <input class="sip-input" id="swpDelayRate" type="number" value="12" min="0.1" max="50" step="0.5" oninput="dCalcSWP()">
        </div>
        <div class="sip-field">
          <label>Corpus After Delay</label>
          <div id="swpCorpusAfterDelay" style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:800;color:var(--g1);padding:11px 14px;background:var(--g-xlight);border:1.5px solid var(--g-light);border-radius:9px">—</div>
        </div>
      </div>
    </div>

    <!-- ─── FUEL GAUGE ─── -->
    <div class="swp-fuel" id="swpFuel" style="display:none">
      <div class="swp-fuel-label">🔋 Corpus Health Monitor</div>
      <div class="swp-fuel-track">
        <div class="swp-fuel-fill" id="swpFuelFill" style="width:100%"></div>
        <div class="swp-fuel-pct" id="swpFuelPct">100%</div>
      </div>
      <div class="swp-fuel-stats" id="swpFuelStats"></div>
    </div>

    <!-- ─── STAT GRID ─── -->
    <div class="swp-stat-grid" id="swpStatGrid" style="display:none"></div>

    <!-- ─── RESULT CARDS ─── -->
    <div class="swp-result-grid" id="swpResultCards" style="display:none"></div>

    <!-- ─── LONGEVITY / RUNWAY ─── -->
    <div id="swpRunwaySection" style="display:none">
      <div class="swp-section-head" style="margin-bottom:14px">⏱️ Corpus Longevity at Different Withdrawal Rates</div>
      <div id="swpRunwayBars"></div>
    </div>

    <!-- ─── SMART INSIGHTS ─── -->
    <div class="swp-insight-cards" id="swpInsights" style="display:none"></div>

    <!-- ─── CHART TABS ─── -->
    <div id="swpChartSection" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div class="swp-section-head" style="margin-bottom:0;flex:1">📊 Projection Chart</div>
        <div style="display:flex;gap:4px">
          <button class="swp-chart-tab active" id="swpChartTabCorpus" onclick="setSWPChartView('corpus',this)">Corpus</button>
          <button class="swp-chart-tab" id="swpChartTabWithdrawn" onclick="setSWPChartView('withdrawn',this)">Withdrawn</button>
          <button class="swp-chart-tab" id="swpChartTabBoth" onclick="setSWPChartView('both',this)">Both</button>
        </div>
      </div>
      <div style="height:320px;position:relative"><canvas id="swpChart" role="img" aria-label="SWP chart showing corpus depletion and withdrawal schedule"></canvas></div>
    </div>

  </div>
</div>


</div>

<!-- PANEL: EMI CALCULATOR -->
<div class="main-panel" id="mpanel-emi" role="tabpanel" aria-labelledby="mtab-emi">
<div class="emi-card">

  <!-- ═══ DEBT DECODER HERO ═══ -->
  <h2 class="sr-only">EMI Calculator with Prepayment Analyser — Debt Decoder</h2>
  <div class="emi-hdr">
    <div class="emi-hdr-grid"></div>
    <div class="emi-hdr-orb emi-hdr-orb1"></div>
    <div class="emi-hdr-orb emi-hdr-orb2"></div>
    <!-- Starfield -->
    <div class="emi-stars" id="emiStars"></div>

    <div class="emi-hdr-inner">
      <!-- Left: title + mode selector -->
      <div class="emi-hdr-left">
        <div class="emi-eyebrow">
          <span class="emi-live-dot"></span>EMI Calculator · Prepayment · Balance Transfer · Amortisation
        </div>
        <div class="emi-title-row">
          <span class="emi-icon">🏦</span>
          <div>
            <div class="emi-name">EMI Calculator</div>
            <div class="emi-sub">Home Loan · Car Loan · Personal Loan · Education Loan · Prepayment Savings</div>
          </div>
        </div>
        <!-- Loan type presets -->
        <div class="emi-preset-row" id="emiPresetRow">
          <button class="emi-preset active" onclick="applyEMIPreset(this,'home')" aria-pressed="true">🏠 Home</button>
          <button class="emi-preset" onclick="applyEMIPreset(this,'car')" aria-pressed="false">🚗 Car</button>
          <button class="emi-preset" onclick="applyEMIPreset(this,'personal')" aria-pressed="false">💳 Personal</button>
          <button class="emi-preset" onclick="applyEMIPreset(this,'education')" aria-pressed="false">🎓 Education</button>
          <button class="emi-preset" onclick="applyEMIPreset(this,'custom')" aria-pressed="false">⚙️ Custom</button>
        </div>
        <!-- Calc mode toggle -->
        <div class="emi-mode-row">
          <div class="emi-mode-toggle" role="radiogroup" aria-label="Calculation mode">
            <button class="emt-btn active" id="emtEMI" onclick="setEMIMode('emi',this)" role="radio" aria-checked="true">Find EMI</button>
            <button class="emt-btn" id="emtLoan" onclick="setEMIMode('loan',this)" role="radio" aria-checked="false">Find Loan Amount</button>
            <button class="emt-btn" id="emtTenure" onclick="setEMIMode('tenure',this)" role="radio" aria-checked="false">Find Tenure</button>
          </div>
          <button onclick="printEMI()" class="swp-hdr-btn" aria-label="Save as PDF">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Save PDF
          </button>
        </div>
      </div>

      <!-- Right: live EMI display with arc -->
      <div class="emi-hdr-right">
        <div class="emi-arc-wrap">
          <svg class="emi-arc-svg" viewBox="0 0 140 140">
            <!-- Track -->
            <circle cx="70" cy="70" r="56" stroke="rgba(255,255,255,.08)" stroke-width="14" fill="none"/>
            <!-- Principal arc -->
            <circle cx="70" cy="70" r="56" stroke="rgba(255,255,255,.2)" stroke-width="14" fill="none"
              stroke-dasharray="351.86" stroke-dashoffset="0"
              stroke-linecap="round" transform="rotate(-90 70 70)" id="emiArcPrincipal"/>
            <!-- Interest arc (red) -->
            <circle cx="70" cy="70" r="56" stroke="#ef5350" stroke-width="14" fill="none"
              stroke-dasharray="351.86" stroke-dashoffset="351.86"
              stroke-linecap="round" transform="rotate(-90 70 70)"
              id="emiArcInterest" style="transition:stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)"/>
            <!-- Glow -->
            <circle cx="70" cy="70" r="56" stroke="#ef9a9a" stroke-width="2" fill="none"
              stroke-dasharray="351.86" stroke-dashoffset="351.86"
              stroke-linecap="round" transform="rotate(-90 70 70)"
              id="emiArcGlow" style="transition:stroke-dashoffset .8s cubic-bezier(.4,0,.2,1);filter:blur(2px);opacity:.4"/>
          </svg>
          <div class="emi-arc-center">
            <div class="emi-arc-label">Interest</div>
            <div class="emi-arc-pct" id="emiArcPct">—%</div>
            <div class="emi-arc-sublabel">of total outflow</div>
          </div>
        </div>
        <div class="emi-hdr-emi-box">
          <div class="emi-hdr-emi-label" id="emiHdrLabel">Monthly EMI</div>
          <div class="emi-hdr-emi-val" id="emiHdrVal">₹—</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ BODY ═══ -->
  <div class="emi-body">

    <!-- ── Journey strip ── -->
    <div class="emi-journey" id="emiJourney">
      <div class="emi-journey-phase ej-loan">
        <div class="ej-icon">💰</div>
        <div class="ej-body">
          <div class="ej-label">Loan Amount</div>
          <div class="ej-val" id="ejLoanAmt">₹—</div>
        </div>
      </div>
      <div class="emi-journey-arrow">→</div>
      <div class="emi-journey-phase ej-emi">
        <div class="ej-icon">📅</div>
        <div class="ej-body">
          <div class="ej-label">Monthly EMI</div>
          <div class="ej-val" id="ejEMI">₹—</div>
        </div>
      </div>
      <div class="emi-journey-arrow">→</div>
      <div class="emi-journey-phase ej-total">
        <div class="ej-icon">🧾</div>
        <div class="ej-body">
          <div class="ej-label">Total Outflow</div>
          <div class="ej-val" id="ejTotal">₹—</div>
        </div>
      </div>
      <div class="emi-journey-arrow">→</div>
      <div class="emi-journey-phase ej-interest">
        <div class="ej-icon">📈</div>
        <div class="ej-body">
          <div class="ej-label">Total Interest</div>
          <div class="ej-val" id="ejInterest">₹—</div>
        </div>
      </div>
    </div>

    <!-- ── Inputs + Results split ── -->
    <div class="emi-split">

      <!-- LEFT: Inputs -->
      <div class="emi-left">
        <div class="emi-section-head">⚙️ Loan Parameters</div>

        <!-- Loan Amount (hidden in Find Loan mode) -->
        <div class="sip-field" id="emiFieldLoan">
          <label class="sif-solo-label" for="emiLoanAmt">Loan Amount (₹)</label>
          <div class="sip-stepper">
            <button class="stp-btn" onclick="stepEMI('emiLoanAmt',-100000,10000,999999999)" aria-label="Decrease loan amount">−</button>
            <div class="stp-input-wrap">
              <span class="stp-prefix">₹</span>
              <input class="stp-input" id="emiLoanAmt" type="number" value="5000000" min="10000" step="50000" oninput="dCalcEMI()" aria-label="Loan amount in rupees">
            </div>
            <button class="stp-btn" onclick="stepEMI('emiLoanAmt',100000,10000,999999999)" aria-label="Increase loan amount">+</button>
          </div>
          <div class="stp-hints">
            <button class="stp-hint" onclick="setEMIField('emiLoanAmt',500000);calcEMI()">₹5L</button>
            <button class="stp-hint" onclick="setEMIField('emiLoanAmt',1000000);calcEMI()">₹10L</button>
            <button class="stp-hint" onclick="setEMIField('emiLoanAmt',2500000);calcEMI()">₹25L</button>
            <button class="stp-hint" onclick="setEMIField('emiLoanAmt',5000000);calcEMI()">₹50L</button>
            <button class="stp-hint" onclick="setEMIField('emiLoanAmt',10000000);calcEMI()">₹1Cr</button>
          </div>
        </div>

        <!-- Interest Rate -->
        <div class="sip-field">
          <label class="sif-solo-label" for="emiRate">Interest Rate (% p.a.)</label>
          <div class="sip-stepper">
            <button class="stp-btn" onclick="stepEMI('emiRate',-0.25,1,36)" aria-label="Decrease interest rate">−</button>
            <div class="stp-input-wrap">
              <input class="stp-input" id="emiRate" type="number" value="8.5" min="1" max="36" step="0.1" oninput="dCalcEMI()" style="text-align:center" aria-label="Annual interest rate in percent">
              <span class="stp-suffix">%</span>
            </div>
            <button class="stp-btn" onclick="stepEMI('emiRate',0.25,1,36)" aria-label="Increase interest rate">+</button>
          </div>
          <div class="stp-hints">
            <button class="stp-hint" onclick="setEMIField('emiRate',7.5);calcEMI()">7.5%</button>
            <button class="stp-hint" onclick="setEMIField('emiRate',8.5);calcEMI()">8.5%</button>
            <button class="stp-hint" onclick="setEMIField('emiRate',10.5);calcEMI()">10.5%</button>
            <button class="stp-hint" onclick="setEMIField('emiRate',14);calcEMI()">14%</button>
          </div>
        </div>

        <!-- Tenure (hidden in Find Tenure mode) -->
        <div class="sip-field" id="emiFieldTenure">
          <label class="sif-solo-label" for="emiTenure">Tenure</label>
          <div class="sip-stepper">
            <button class="stp-btn" onclick="stepEMI('emiTenure',-1,1,30)" aria-label="Decrease tenure">−</button>
            <div class="stp-input-wrap">
              <input class="stp-input" id="emiTenure" type="number" value="20" min="1" max="30" step="1" oninput="dCalcEMI()" style="text-align:center" aria-label="Loan tenure in years">
              <select class="stp-unit-select" id="emiTenureUnit" onchange="calcEMI()" aria-label="Tenure unit">
                <option value="years" selected>Yrs</option>
                <option value="months">Mo</option>
              </select>
            </div>
            <button class="stp-btn" onclick="stepEMI('emiTenure',1,1,30)" aria-label="Increase tenure">+</button>
          </div>
          <div class="stp-hints">
            <button class="stp-hint" onclick="setEMIField('emiTenure',5);setEMIUnit('years');calcEMI()">5Y</button>
            <button class="stp-hint" onclick="setEMIField('emiTenure',10);setEMIUnit('years');calcEMI()">10Y</button>
            <button class="stp-hint" onclick="setEMIField('emiTenure',15);setEMIUnit('years');calcEMI()">15Y</button>
            <button class="stp-hint" onclick="setEMIField('emiTenure',20);setEMIUnit('years');calcEMI()">20Y</button>
            <button class="stp-hint" onclick="setEMIField('emiTenure',30);setEMIUnit('years');calcEMI()">30Y</button>
          </div>
        </div>

        <!-- EMI field (only shown in Find Loan/Tenure mode) -->
        <div class="sip-field" id="emiFieldEMI" style="display:none">
          <label class="sif-solo-label" for="emiAmount">Monthly EMI (₹)</label>
          <div class="sip-stepper">
            <button class="stp-btn" onclick="stepEMI('emiAmount',-500,1000,9999999)" aria-label="Decrease EMI">−</button>
            <div class="stp-input-wrap">
              <span class="stp-prefix">₹</span>
              <input class="stp-input" id="emiAmount" type="number" value="40000" min="1000" step="500" oninput="dCalcEMI()" aria-label="Monthly EMI amount">
            </div>
            <button class="stp-btn" onclick="stepEMI('emiAmount',500,1000,9999999)" aria-label="Increase EMI">+</button>
          </div>
          <div class="stp-hints">
            <button class="stp-hint" onclick="setEMIField('emiAmount',10000);calcEMI()">₹10K</button>
            <button class="stp-hint" onclick="setEMIField('emiAmount',25000);calcEMI()">₹25K</button>
            <button class="stp-hint" onclick="setEMIField('emiAmount',50000);calcEMI()">₹50K</button>
            <button class="stp-hint" onclick="setEMIField('emiAmount',100000);calcEMI()">₹1L</button>
          </div>
        </div>

        <!-- Prepayment section -->
        <div class="emi-prepay-box" id="emiPrepayBox">
          <div class="emi-prepay-top">
            <div class="emi-prepay-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Prepayment / Part Payment
            </div>
            <label class="swp-delay-toggle" aria-label="Toggle prepayment">
              <input type="checkbox" id="emiPrepayToggle" onchange="togglePrepay()">
              <span class="swp-delay-slider"></span>
            </label>
          </div>
          <div class="emi-prepay-fields" id="emiPrepayFields">
            <div class="sip-field" style="margin:0">
              <label class="sif-solo-label" for="emiPrepayAmt" style="font-size:.6rem">Prepay Amount (₹/year)</label>
              <div class="sip-stepper">
                <button class="stp-btn" onclick="stepEMI('emiPrepayAmt',-10000,0,99999999)" aria-label="Decrease prepayment">−</button>
                <div class="stp-input-wrap">
                  <span class="stp-prefix">₹</span>
                  <input class="stp-input" id="emiPrepayAmt" type="number" value="100000" min="0" step="10000" oninput="dCalcEMI()" aria-label="Annual prepayment amount">
                </div>
                <button class="stp-btn" onclick="stepEMI('emiPrepayAmt',10000,0,99999999)" aria-label="Increase prepayment">+</button>
              </div>
            </div>
            <div class="sip-field" style="margin:0">
              <label class="sif-solo-label" for="emiPrepayFrom" style="font-size:.6rem">Starting from year</label>
              <div class="sip-stepper">
                <button class="stp-btn" onclick="stepEMI('emiPrepayFrom',-1,1,29)" aria-label="Decrease prepayment start year">−</button>
                <div class="stp-input-wrap">
                  <input class="stp-input" id="emiPrepayFrom" type="number" value="1" min="1" step="1" oninput="dCalcEMI()" style="text-align:center" aria-label="Prepayment start year">
                </div>
                <button class="stp-btn" onclick="stepEMI('emiPrepayFrom',1,1,29)" aria-label="Increase prepayment start year">+</button>
              </div>
            </div>
          </div>
        </div>


        <!-- Balance Transfer section -->
        <div class="emi-bt-box" id="emiBTBox">
          <div class="emi-bt-top">
            <div class="emi-bt-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
              Balance Transfer / Refinance
            </div>
            <label class="swp-delay-toggle" aria-label="Toggle balance transfer analysis">
              <input type="checkbox" id="emiBTToggle" onchange="toggleBT()">
              <span class="swp-delay-slider"></span>
            </label>
          </div>
          <div class="emi-bt-fields" id="emiBTFields">

            <div class="sip-field" style="margin:0">
              <label class="sif-solo-label" for="emiBTRate" style="font-size:.6rem">New Interest Rate (% p.a.)</label>
              <div class="sip-stepper">
                <button class="stp-btn" onclick="stepEMI('emiBTRate',-0.25,1,36)" aria-label="Decrease new rate">−</button>
                <div class="stp-input-wrap">
                  <input class="stp-input" id="emiBTRate" type="number" value="7.5" min="1" max="36" step="0.25" oninput="dCalcEMI()" style="text-align:center" aria-label="New interest rate after transfer">
                  <span class="stp-suffix">%</span>
                </div>
                <button class="stp-btn" onclick="stepEMI('emiBTRate',0.25,1,36)" aria-label="Increase new rate">+</button>
              </div>
              <div class="stp-hints">
                <button class="stp-hint" onclick="setEMIField('emiBTRate',7);dCalcEMI()">7%</button>
                <button class="stp-hint" onclick="setEMIField('emiBTRate',7.5);dCalcEMI()">7.5%</button>
                <button class="stp-hint" onclick="setEMIField('emiBTRate',8);dCalcEMI()">8%</button>
                <button class="stp-hint" onclick="setEMIField('emiBTRate',8.5);dCalcEMI()">8.5%</button>
              </div>
            </div>

            <div class="sip-field" style="margin:0">
              <label class="sif-solo-label" for="emiBTFee" style="font-size:.6rem">Transfer Fee (% of outstanding)</label>
              <div class="sip-stepper">
                <button class="stp-btn" onclick="stepEMI('emiBTFee',-0.25,0,5)" aria-label="Decrease transfer fee">−</button>
                <div class="stp-input-wrap">
                  <input class="stp-input" id="emiBTFee" type="number" value="0.5" min="0" max="5" step="0.25" oninput="dCalcEMI()" style="text-align:center" aria-label="Balance transfer fee as percentage">
                  <span class="stp-suffix">%</span>
                </div>
                <button class="stp-btn" onclick="stepEMI('emiBTFee',0.25,0,5)" aria-label="Increase transfer fee">+</button>
              </div>
              <div class="stp-hints">
                <button class="stp-hint" onclick="setEMIField('emiBTFee',0);dCalcEMI()">0%</button>
                <button class="stp-hint" onclick="setEMIField('emiBTFee',0.5);dCalcEMI()">0.5%</button>
                <button class="stp-hint" onclick="setEMIField('emiBTFee',1);dCalcEMI()">1%</button>
                <button class="stp-hint" onclick="setEMIField('emiBTFee',1.5);dCalcEMI()">1.5%</button>
              </div>
            </div>

            <div class="sip-field" style="margin:0">
              <label class="sif-solo-label" for="emiBTElapsed" style="font-size:.6rem">Months already paid</label>
              <div class="sip-stepper">
                <button class="stp-btn" onclick="stepEMI('emiBTElapsed',-6,0,360)" aria-label="Decrease months paid">−</button>
                <div class="stp-input-wrap">
                  <input class="stp-input" id="emiBTElapsed" type="number" value="24" min="0" step="1" oninput="dCalcEMI()" style="text-align:center" aria-label="Number of EMIs already paid">
                </div>
                <button class="stp-btn" onclick="stepEMI('emiBTElapsed',6,0,360)" aria-label="Increase months paid">+</button>
              </div>
              <div class="stp-hints">
                <button class="stp-hint" onclick="setEMIField('emiBTElapsed',12);dCalcEMI()">1Y</button>
                <button class="stp-hint" onclick="setEMIField('emiBTElapsed',24);dCalcEMI()">2Y</button>
                <button class="stp-hint" onclick="setEMIField('emiBTElapsed',36);dCalcEMI()">3Y</button>
                <button class="stp-hint" onclick="setEMIField('emiBTElapsed',60);dCalcEMI()">5Y</button>
              </div>
            </div>

          </div>
        </div>

      </div><!-- /.emi-left -->

      <!-- RIGHT: Results -->
      <div class="emi-right">

        <!-- Summary cards -->
        <div class="emi-summary-grid" id="emiSummaryGrid"></div>

        <!-- SIP Insight box -->
        <div class="emi-sip-insight" id="emiSIPInsight" style="display:none">
          <div class="esi-icon">💡</div>
          <div class="esi-body">
            <div class="esi-title">What if you invested this EMI instead?</div>
            <div class="esi-text" id="esiText"></div>
          </div>
        </div>

        <!-- Prepayment comparison -->
        <div class="emi-prepay-result" id="emiPrepayResult" style="display:none">
          <div class="emi-section-head" style="margin-bottom:12px">⚡ Prepayment Impact</div>
          <div class="emi-prepay-compare" id="emiPrepayCompare"></div>
        </div>

        <!-- Balance Transfer result -->
        <div class="emi-bt-result" id="emiBTResult">
          <div class="emi-section-head" style="margin-bottom:10px">🔄 Balance Transfer Analysis</div>
          <div class="emi-bt-cols" id="emiBTCols"></div>
          <div class="emi-bt-verdict" id="emiBTVerdict"></div>
        </div>

        <!-- Chart -->
        <div class="emi-section-head" style="margin-bottom:8px">📊 Amortisation Breakdown</div>
        <div class="emi-chart-wrap">
          <canvas id="emiChart" role="img" aria-label="EMI amortisation chart showing principal vs interest over loan tenure"></canvas>
        </div>

      </div><!-- /.emi-right -->
    </div><!-- /.emi-split -->

    <!-- Amortisation table (collapsible) -->
    <div class="emi-table-section">
      <button class="emi-table-toggle" id="emiTableToggle" onclick="toggleEMITable()" aria-expanded="false">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
        Show Year-by-Year Schedule
        <span class="emi-toggle-arrow" id="emiToggleArrow">▼</span>
      </button>
      <div class="emi-table-wrap" id="emiTableWrap" style="display:none">
        <div class="emi-table-inner" id="emiTableInner"></div>
      </div>
    </div>

  </div><!-- /.emi-body -->
</div><!-- /.emi-card -->
</div>

<!-- FOOTER -->
`;

const FAQ_HTML = `<section class="faq-section" aria-label="Frequently Asked Questions" id="faq">
  <div class="page">
    <div class="section-divider"><div class="section-divider-line"></div><div class="section-divider-label">FAQ</div><div class="section-divider-line"></div></div>
    <h2 class="faq-heading">Frequently Asked Questions</h2>
    <div class="faq-list">
      <details class="faq-item">
        <summary class="faq-q">How do I compare mutual funds online for free?</summary>
        <div class="faq-a">Use the <strong>Fund Compare</strong> tab. Search any AMFI-registered fund by name or AMC and add up to 5 funds. The tool shows NAV performance, 1M/3M/1Y/3Y/5Y returns, Sharpe ratio, volatility and maximum drawdown using live data from AMFI.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">What is Sharpe Ratio and what is a good score?</summary>
        <div class="faq-a">Sharpe Ratio measures risk-adjusted return: <strong>(Fund CAGR − risk-free rate) ÷ annualised volatility</strong>. This tool uses 6.5% as the risk-free rate (Indian G-Sec approximation). A Sharpe above 1 is good; above 2 is excellent. Calculated on 5Y data, or full history for newer funds.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">How is SIP return calculated?</summary>
        <div class="faq-a">Each monthly instalment earns compounded returns for the remaining investment period. The SIP calculator shows corpus at conservative, moderate and aggressive return scenarios. It also supports <strong>step-up SIP</strong> — increasing your monthly investment by a fixed % each year.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">What is SWP and how does it work for retirement income?</summary>
        <div class="faq-a"><strong>Systematic Withdrawal Plan (SWP)</strong> lets you withdraw a fixed amount monthly from your mutual fund corpus while the remainder keeps growing. The SWP tab models corpus longevity, shows month-by-month depletion and supports an optional delay period before withdrawals begin.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">How much SIP do I need to reach my financial goal?</summary>
        <div class="faq-a">Go to the <strong>Goal Planner</strong> tab. Enter your target amount, time horizon, expected return rate and existing corpus. The tool calculates the required monthly SIP, lumpsum, or a combination — with optional inflation adjustment on the target.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">How is EMI calculated? What is an amortisation schedule?</summary>
        <div class="faq-a">EMI formula: <strong>P × r × (1+r)ⁿ / ((1+r)ⁿ − 1)</strong> where P = principal, r = monthly rate, n = instalments. An amortisation schedule shows year-by-year how much EMI goes to interest vs. principal. Early years are interest-heavy. The EMI tab shows the full schedule with prepayment rows highlighted.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">Should I transfer my home loan to a lower interest rate?</summary>
        <div class="faq-a">Use the <strong>Balance Transfer Analyser</strong> in the EMI tab. Enter your current loan, the new lender's rate and processing fee. The tool calculates whether interest savings outweigh switching costs and gives a clear recommend / not recommended verdict with exact figures.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">Is this calculator free? Who made it?</summary>
        <div class="faq-a">Yes, completely free. Built by <strong>Abundance Financial Services®</strong> (ARN-251838), an AMFI-registered Mutual Funds Distributor in Haldwani, Uttarakhand. All NAV data is sourced live from AMFI via the open mfapi.in API. No login required.</div>
      </details>

      <details class="faq-item">
        <summary class="faq-q">What is a Specialised Investment Fund (SIF)?</summary>
        <div class="faq-a"><strong>SIF (Specialised Investment Fund)</strong> is a new SEBI-regulated category launched in 2025, sitting between Mutual Funds and PMS. Minimum investment is <strong>₹10 lakh</strong>. SIFs can run long-short strategies, use derivatives, and take more concentrated positions than a regular mutual fund — giving sophisticated investors access to alpha-seeking strategies at a fraction of PMS cost.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">SIF vs Mutual Fund vs PMS — what's the difference?</summary>
        <div class="faq-a">
          <strong>Mutual Fund:</strong> Starts from ₹500. Standardised SEBI-regulated strategies. Best for most retail investors.<br>
          <strong>SIF:</strong> Minimum ₹10 lakh. Flexible strategies (long-short, derivatives overlay). Demat-held units. New in 2025.<br>
          <strong>PMS:</strong> Minimum ₹50 lakh. Fully customised portfolio. Direct securities in your name.<br>
          Abundance Financial Services® is an authorised distributor of all three.
        </div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">Who can invest in SIF and what is the minimum amount?</summary>
        <div class="faq-a">Any resident Indian, HUF, NRI, or institution with completed KYC can invest in a SIF. The minimum ticket is <strong>₹10 lakh</strong> per investor. This threshold is designed to ensure investors have the financial sophistication and risk capacity for SIF strategies. <a href="https://www.getabundance.in/contact-us" target="_blank" rel="noopener">Contact Abundance Financial Services</a> to explore which SIF is right for you.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">How is SIF taxed — LTCG or slab rate?</summary>
        <div class="faq-a">SIF taxation mirrors mutual fund rules. <strong>Equity-oriented SIFs</strong> held 1+ year: 12.5% LTCG on gains above ₹1.25L/year. Held under 1 year: 20% STCG. <strong>Debt-oriented SIFs:</strong> gains taxed at your income slab rate. Always consult a tax advisor as SIF-specific rules are still being finalised by SEBI.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">Can I invest in SIF through Abundance Financial Services, Haldwani?</summary>
        <div class="faq-a">Yes. <strong>Abundance Financial Services®</strong> (ARN-251838) is an <strong>AMFI-registered SIF Distributor serving investors across India</strong>. Call us on <a href="tel:+919808105923">+91 98081 05923</a> or visit <a href="https://www.getabundance.in/contact-us" target="_blank" rel="noopener">getabundance.in</a> to book a free consultation and explore SIF options matching your goals.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">What is the SIP NAV Backtester and how is it different from the SIP Calculator?</summary>
        <div class="faq-a">The <strong>SIP Calculator</strong> is a projection tool — it uses an assumed return rate to estimate your future corpus. The <strong>SIP NAV Backtester</strong> uses <em>actual historical NAV data</em> from AMFI — it buys units at real monthly prices, accumulates them, and shows what your actual corpus and XIRR would have been. For example, a backtest on a Flexi Cap fund from Jan 2010 to Dec 2024 shows the real outcome including market crashes and recoveries — not an assumption. It also shows a what-if table comparing different start years on the same fund.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">What is the SWP NAV Backtester and how does it work?</summary>
        <div class="faq-a">The <strong>SWP NAV Backtester</strong> lets you replay a Systematic Withdrawal Plan against a mutual fund's actual historical NAV data. Enter a starting corpus, monthly withdrawal amount, optional step-up, and a date range — and the tool simulates month-by-month unit redemption at real NAVs. It shows whether your corpus survived, the actual <strong>XIRR</strong> earned, total amount withdrawn, remaining corpus, and a what-if table comparing different start years. This gives a realistic picture of how SWP would have performed on a specific fund — not just a theoretical projection.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">What is XIRR and why does the backtester use it instead of CAGR?</summary>
        <div class="faq-a"><strong>XIRR (Extended Internal Rate of Return)</strong> calculates the annualised return of irregular cashflows — perfect for SWP where withdrawals happen monthly but the corpus invested lump-sum at the start. CAGR only works for a single start and end value with no intermediate flows. XIRR accounts for the timing and size of every withdrawal, giving a true picture of what the investment actually returned. A positive XIRR means your corpus grew faster than you withdrew; a negative XIRR means withdrawals exceeded growth.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">Can I share my SWP backtest results with someone?</summary>
        <div class="faq-a">Yes — use the <strong>Share URL</strong> button in the SWP Backtester. It generates a link that encodes all your inputs (fund, corpus, withdrawal amount, date range) and key results (XIRR, survival status, remaining corpus). When shared on WhatsApp, LinkedIn or Telegram, the link shows a rich preview card with your backtest summary. The recipient opens the exact same backtest pre-loaded in their browser — no login required.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">What is the SIP NAV Backtester and how is it different from a regular SIP calculator?</summary>
        <div class="faq-a">A regular SIP calculator assumes a fixed return rate. The <strong>SIP NAV Backtester</strong> (in the SIP tab) uses a fund's actual historical NAV data to simulate a real SIP — each monthly instalment buys units at the real NAV for that month. The final corpus reflects actual accumulated units at the ending NAV, including real market crashes and rallies. You also get <strong>XIRR</strong> on actual cashflows, plus a What-If table comparing 5 different start years automatically.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">How is XIRR calculated in the SIP NAV Backtester?</summary>
        <div class="faq-a">Each monthly SIP instalment is treated as a negative cashflow on its actual investment date, and the final corpus value is a positive cashflow on the end date. <strong>XIRR (Extended Internal Rate of Return)</strong> finds the annualised return that makes all these cashflows net to zero — the correct measure for periodic investments. Unlike CAGR, XIRR accounts for the exact timing of every instalment.</div>
      </details>
      <details class="faq-item">
        <summary class="faq-q">Can I share my SIP backtest results with someone?</summary>
        <div class="faq-a">Yes — the <strong>Share URL</strong> button in the SIP NAV Backtester creates a shareable link encoding the fund, SIP amount, step-up, date range, and key results (XIRR, final corpus, total invested). When sent on WhatsApp or LinkedIn, it generates a rich preview card. The recipient opens the exact same backtest pre-loaded — no login required.</div>
      </details>
      
      <details class="faq-item">
        <summary class="faq-q">How do I use the SIP NAV Backtester?</summary>
        <div class="faq-a">Go to the <strong>SIP tab</strong> and click <strong>📊 NAV Backtest</strong> in the mode selector. Search for any AMFI-registered mutual fund by name, enter your monthly SIP amount, optional annual step-up %, and the start and end date range. The tool fetches the fund's full NAV history and simulates buying units each month at the actual NAV. Results include final corpus, total invested, XIRR, best and worst start-year scenarios, and a corpus growth chart.</div>
      </details>
      
    </div>
  </div>
</section>
`;

export default function HomePage() {
  return (
    <>
      {/* ── JSON-LD Structured Data ── */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_WEB_APP) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_BREADCRUMB) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_LOCAL_BUSINESS) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_WEBSITE) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_SOFTWARE_APP) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_FAQ) }} />

      {/* ── Chart.js + mfcalc-main.js (Client Component handles ordering) ── */}
      <HomeScripts />

      {/* ── Accessibility ── */}
      <div className="accent-line" />
      <a href="#mpanel-fund" className="skip-link">Skip to main content</a>
      <h1 className="sr-only">
        Free MF Comparison, SIP Calculator &amp; SWP Backtester — Abundance Financial Services
      </h1>

      {/* ── Page shell ── */}
      <div className="page">
        <Navbar activePage="calculator" variant="home" />
        {/* Calculator panels rendered as raw HTML so inline onclick= handlers
            work correctly with the vanilla JS from mfcalc-main.js */}
        <div dangerouslySetInnerHTML={{ __html: MAIN_HTML }} />
      </div>

      {/* ── FAQ section (has its own .page wrapper inside) ── */}
      <div dangerouslySetInnerHTML={{ __html: FAQ_HTML }} />

      {/* ── Footer ── */}
      <Footer variant="home" />

      {/* ── WhatsApp share button ── */}
      <a
        className="wa-share-btn"
        href="https://wa.me/?text=Free%20mutual%20fund%20%26%20loan%20calculator%20%E2%80%94%20compare%20funds%2C%20SIP%2C%20SWP%2C%20EMI%2C%20goal%20planner.%20Live%20AMFI%20data.%20By%20Abundance%20Financial%20Services%C2%AE%20(ARN-251838).%0A%0Ahttps%3A%2F%2Fmfcalc.getabundance.in%2F"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on WhatsApp"
        title="Share on WhatsApp"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.845L.057 23.882a.5.5 0 0 0 .61.61l6.037-1.471A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.015-1.376l-.36-.214-3.731.909.924-3.636-.236-.374A9.818 9.818 0 1 1 12 21.818z"/>
        </svg>
        <span>Share</span>
      </a>
    </>
  );
}
