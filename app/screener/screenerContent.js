// app/screener/screenerContent.js
// Shared, framework-neutral content for the MF screener page -- imported by
// both the server page.js (metadata) and the client ScreenerClient.jsx
// (rendering), so the two never drift out of sync.

export const shortCat = (c = '') => c.replace(/^(Equity|Debt|Hybrid|Other|Solution Oriented)\s+Scheme\s*-\s*/i, '').replace(/\s+Fund$/i, '').trim() || c;

export const CURATED_CATEGORIES = [
  {
    slug: 'large-cap',
    label: 'Large Cap',
    category: 'Equity Scheme - Large Cap Fund',
    subtitleSuffix: ' Large Cap funds invest in India’s top 100 companies by market capitalisation.',
    metaBlurb: 'Large Cap funds invest in India’s top 100 companies by market cap — the most stable, liquid part of the equity market.',
    explainer: 'Large Cap funds invest at least 80% of assets in India’s top 100 companies by market capitalisation — the most established, liquid names on the exchange. They tend to be the least volatile equity category, making them a common starting point for a core portfolio, though that stability usually comes with more modest upside than mid or small cap funds during strong bull phases.',
  },
  {
    slug: 'mid-cap',
    label: 'Mid Cap',
    category: 'Equity Scheme - Mid Cap Fund',
    subtitleSuffix: ' Mid Cap funds invest in companies ranked 101st–250th by market capitalisation.',
    metaBlurb: 'Mid Cap funds invest in companies ranked 101st–250th by market cap, balancing growth potential with moderate risk.',
    explainer: 'Mid Cap funds invest at least 65% of assets in companies ranked 101st–250th by market capitalisation — businesses past the small-cap stage but not yet market leaders. They sit between large and small cap on the risk-return spectrum, offering more growth potential than large caps with materially less volatility than small caps.',
  },
  {
    slug: 'small-cap',
    label: 'Small Cap',
    category: 'Equity Scheme - Small Cap Fund',
    subtitleSuffix: ' Small Cap funds invest in companies ranked 251st and below by market capitalisation.',
    metaBlurb: 'Small Cap funds invest in companies ranked 251st and below by market cap — the highest-growth, highest-volatility equity category.',
    explainer: 'Small Cap funds invest at least 65% of assets in companies ranked 251st and below by market capitalisation. This is the highest-growth-potential but also highest-volatility equity category — small caps can fall 40–50%+ in a sharp correction, so they suit investors with a long horizon (7+ years) and a high risk tolerance, typically as a smaller slice of a diversified portfolio rather than a core holding.',
  },
  {
    slug: 'flexi-cap',
    label: 'Flexi Cap',
    category: 'Equity Scheme - Flexi Cap Fund',
    subtitleSuffix: ' Flexi Cap funds invest across market caps without a fixed mandate.',
    metaBlurb: 'Flexi Cap funds invest at least 65% in equity with no fixed large/mid/small cap split, giving the fund manager full flexibility.',
    explainer: 'Flexi Cap funds must invest at least 65% in equity but face no mandated split across large, mid and small cap — the fund manager can move freely between them based on where they see opportunity. This flexibility makes Flexi Cap a popular single-fund core holding for investors who’d rather leave the cap-size allocation call to a professional manager.',
  },
  {
    slug: 'elss',
    label: 'ELSS',
    category: 'Equity Scheme - ELSS',
    subtitleSuffix: ' ELSS funds qualify for a Section 80C tax deduction with a 3-year lock-in.',
    metaBlurb: 'ELSS funds offer a Section 80C tax deduction up to ₹1.5 lakh with a mandatory 3-year lock-in.',
    explainer: 'ELSS (Equity Linked Savings Scheme) funds invest predominantly in equity and are the only mutual fund category that qualifies for a tax deduction under Section 80C, up to ₹1.5 lakh per financial year. They come with a mandatory 3-year lock-in — the shortest among all 80C options — but still carry full equity market risk, so the tax benefit shouldn’t be the only reason to invest.',
  },
  {
    slug: 'multi-asset-allocation',
    label: 'Multi Asset Allocation',
    category: 'Hybrid Scheme - Multi Asset Allocation',
    subtitleSuffix: ' Multi Asset Allocation funds diversify across equity, debt and gold.',
    metaBlurb: 'Multi Asset Allocation funds invest across equity, debt and gold/commodities, with a minimum 10% in each asset class.',
    explainer: 'Multi Asset Allocation funds must invest in at least three asset classes — typically equity, debt and gold/commodities — with a minimum 10% allocation to each. That built-in diversification across asset classes (not just across stocks) is designed to smooth returns across market cycles, since equity, debt and gold rarely fall together, at the cost of capping the upside compared to a pure-equity fund in a strong bull run.',
  },
];

export function slugToCategory(slug) {
  const entry = CURATED_CATEGORIES.find((c) => c.slug === slug);
  return entry ? entry.category : null;
}

export function categoryToSlug(category) {
  const entry = CURATED_CATEGORIES.find((c) => c.category === category);
  return entry ? entry.slug : null;
}

export const GLOSSARY_ITEMS = [
  { q: 'CAGR (Compound Annual Growth Rate)', a: 'The annualised rate at which an investment would have grown, assuming steady compounding, to get from its starting value to its ending value. It’s the standard way to compare returns across different time periods on a like-for-like basis — a fund’s 3-year and 5-year CAGR can be directly compared even though the underlying periods differ.' },
  { q: 'Volatility', a: 'The annualised standard deviation of a fund’s monthly returns — a measure of how much the fund’s value swings up and down, not the direction of those swings. A higher volatility number means a bumpier ride, even if the long-term destination (the CAGR) ends up the same.' },
  { q: 'Max Drawdown', a: 'The largest peak-to-trough fall the fund has experienced within the available history — the worst-case loss an investor would have seen if they’d bought at the top and sold at the bottom. It’s a real, lived-through number, not a projection, and is one of the best gut-checks for whether you can actually stomach holding a fund through its worst period.' },
  { q: 'Return-per-Risk', a: 'CAGR divided by volatility — a rough measure of how much return a fund delivered for each unit of bumpiness it put investors through. Two funds with similar CAGR can have very different return-per-risk if one got there smoothly and the other got there through wild swings.' },
  { q: 'Expense Ratio', a: 'The annual fee, as a percentage of assets, that a fund charges to cover management and operating costs. It’s deducted daily before the NAV is calculated, so every return figure you see anywhere — including on this page — is already net of this fee.' },
];

export const FAQ_ITEMS = [
  // Using the Screener
  { group: 'Using the Screener', q: 'How are the returns calculated?', a: 'Point-to-point CAGR from real AMFI NAVs — the latest NAV versus the NAV one, three and five years earlier. For periods shorter than a fund’s age, the figure is left blank rather than estimated. Since-inception return is the CAGR from the fund’s launch NAV (₹10) to today, using the oldest available NAV record from mfapi.in.' },
  { group: 'Using the Screener', q: 'How current is the data?', a: 'The dataset is rebuilt every day from AMFI’s official NAV files, so the figures reflect the most recent published NAVs.' },
  { group: 'Using the Screener', q: 'What do volatility and max drawdown mean?', a: 'Volatility is the annualised standard deviation of monthly returns — how bumpy the ride was. Max drawdown is the largest peak-to-trough fall. Both are on a month-end basis over the available history.' },
  { group: 'Using the Screener', q: 'Why do some funds show a dash instead of a return figure?', a: 'A dash means the fund doesn’t have enough NAV history for that period — for example, a fund launched 2 years ago won’t have a 3-year or 5-year return yet. We deliberately leave the cell blank rather than estimating or extrapolating a number, since a fabricated figure would be misleading.' },

  // Choosing a Category
  { group: 'Choosing a Category', q: 'What’s the difference between Large, Mid and Small Cap funds?', a: 'It comes down to which companies, by size, the fund is required to hold. Large Cap funds invest at least 80% in India’s top 100 companies by market cap — the most stable, liquid names. Mid Cap funds invest at least 65% in companies ranked 101st–250th, offering more growth potential with more volatility. Small Cap funds invest at least 65% in companies ranked 251st and below — the highest growth potential, but also the sharpest drawdowns in a correction.' },
  { group: 'Choosing a Category', q: 'What does the 3-year lock-in on ELSS funds mean?', a: 'Every ELSS investment — including each individual SIP instalment — is locked in for 3 years from its purchase date and can’t be redeemed before that, regardless of market conditions. In exchange, ELSS is the only mutual fund category eligible for a Section 80C tax deduction. The lock-in doesn’t remove market risk — your investment can still be worth less than you put in if equity markets are down when the lock-in ends.' },
  { group: 'Choosing a Category', q: 'Who should invest in thematic or sectoral funds?', a: 'Thematic and sectoral funds (banking, pharma, infrastructure, technology, PSU, and similar) concentrate in a single sector or theme instead of diversifying across the market, which makes them SEBI’s ‘Very High’ risk category. They’re best suited as a small satellite allocation — typically no more than 5–10% of an equity portfolio — for investors who already hold a diversified core (Flexi Cap, Large Cap, or similar), understand the specific sector’s business cycle, and can tolerate that sector underperforming or falling for several years at a stretch. They’re generally a poor choice as a first or only equity fund, and buying into a theme after it has already rallied hard is one of the most common ways investors lose money in this category — the sector calls that work are rarely the obvious, already-popular ones.' },
  { group: 'Choosing a Category', q: 'Are index funds always a better choice than actively managed funds?', a: 'Not necessarily — it depends heavily on the category. In India’s large-cap segment, which is closely tracked by analysts and institutions, index funds have a genuinely strong case: SPIVA India scorecards have repeatedly shown that a majority of actively managed large-cap funds struggle to beat their benchmark after fees over long periods, because the segment is efficiently priced with little room for a manager’s stock-picking to add value beyond the index. Mid and small cap tell a different story — these segments are less researched and less efficiently priced, and the same SPIVA data has historically shown active funds outperforming their benchmarks more often here, because skilled managers have more genuine mispricing to exploit. A reasonable, non-dogmatic approach: lean towards low-cost index funds for your large-cap allocation, and evaluate active funds on their actual net track record — not just their pedigree — for mid cap, small cap, and other less-efficient categories. Past outperformance is never a guarantee of future outperformance in either camp.' },
  { group: 'Choosing a Category', q: 'Does a higher expense ratio always mean lower returns?', a: 'No — and this is one of the most common misunderstandings about mutual funds. Every return figure you see for a fund, on this page or anywhere else, is calculated from its NAV, and the expense ratio is deducted daily before that NAV is struck. In other words, the fee is already baked into the number you’re looking at — it isn’t added on top afterward. So a fund with a 1.5% expense ratio and a 14% displayed return actually outperformed a fund with a 0.5% expense ratio and a 12% displayed return, fee and all. What actually matters is the net return relative to comparable funds and the benchmark, not the expense ratio in isolation. Where expense ratio does deserve real weight is as a tie-breaker between two funds with genuinely similar net returns and consistency, or in categories like large-cap/index-hugging funds where sustained fee-beating outperformance is rare to begin with — there, a lower cost has less to make up for.' },

  // SIFs & Mutual Funds
  { group: 'SIFs & Mutual Funds', q: 'What is a Specialised Investment Fund (SIF) and how is it different from a mutual fund?', a: 'A Specialised Investment Fund (SIF) is a newer SEBI-regulated investment vehicle that sits between mutual funds and Portfolio Management Services (PMS). SIFs can use strategies mutual funds generally can’t — such as long-short equity positions — and require a minimum investment of ₹10 lakh, compared to as little as ₹500 for a mutual fund SIP. They’re aimed at investors who want more flexible, higher-conviction strategies than a traditional mutual fund but don’t yet have the scale for a dedicated PMS.' },
  { group: 'SIFs & Mutual Funds', q: 'Why isn’t there a SIP option for SIFs?', a: 'SIFs require a minimum lumpsum investment of ₹10 lakh under SEBI rules — there’s no SIP (systematic investment) mode for them the way there is for mutual funds, so we don’t show a hypothetical SIP figure. All wealth-simulation numbers for SIFs on this site assume a ₹10 lakh lumpsum, matching the actual minimum ticket size.' },

  // Stress Test & Liquidity
  { group: 'Stress Test & Liquidity', q: 'What is the Mutual Fund Stress Test & Liquidity Analysis?', a: 'As mandated by SEBI and AMFI, all Mid Cap and Small Cap mutual funds must disclose monthly stress test results. This liquidity analysis indicates the number of days a fund manager would take to liquidate 25% and 50% of the portfolio under stress conditions. It also details liability-side concentration (top 10 investors’ share), asset allocation breakdown (large, mid, small cap and cash %), and portfolio valuation (PE ratio) vs. benchmark to help investors evaluate portfolio risk in bloated or concentrated funds.' },
  { group: 'Stress Test & Liquidity', q: 'How do I interpret ‘Days to Liquidate’ in the stress test data?', a: 'The ‘Days to Liquidate 50%’ discloses how long the fund manager would need to sell half of the fund’s assets in a market panic without causing severe price impact. Fewer days indicate high liquidity and lower redemption risk. As a rule of thumb: 1–5 days is excellent/highly liquid, 6–15 days is moderate, and more than 15 days suggests higher potential liquidity risk under market pressure.' },

  // Compliance
  { group: 'Compliance', q: 'Is this investment advice?', a: 'No. This is an educational data tool. Past performance is not indicative of future results, and nothing here is a recommendation. Please consult your financial advisor before investing.' },
];
