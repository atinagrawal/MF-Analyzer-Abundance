/**
 * lib/articles.js — Client-safe article manifest for /articles
 *
 * No Node APIs (fs/path) here on purpose -- app/articles/page.js is a
 * 'use client' component (needs the pillar-filter interactivity) that
 * imports ARTICLES/PILLARS from this file, so anything requiring fs would
 * pull Node built-ins into the browser bundle and fail to compile. The
 * markdown body loader (which does need fs) lives in lib/articlesContent.js
 * instead, imported only by the server-only [slug]/page.jsx.
 *
 * publishedDate is intentionally the same for every entry in this initial
 * batch -- they're genuinely all being published on the same day, and
 * inventing a staggered publish history would be exactly the kind of
 * dishonesty this content series argues against.
 */

export const PILLARS = {
  'uncomfortable-truth': 'The Uncomfortable Truth',
  'decoded': 'Decoded',
  'money-psychology': 'Money Psychology',
  'numbers-that-matter': 'Numbers That Matter',
  'beyond-mutual-funds': 'Beyond Mutual Funds',
  'advisors-notebook': "The Advisor's Notebook",
  'rate-journey': 'Rate Journey',
};

const PUBLISHED_DATE = '2026-08-30';

export const ARTICLES = [
  {
    slug: 'why-your-mfd-recommended-a-regular-plan',
    file: 'uncomfortable-truth-direct-vs-regular.md',
    pillar: 'uncomfortable-truth',
    title: 'Why Your Mutual Fund Distributor Recommended a Regular Plan',
    description: "Every Direct Plan is cheaper than its Regular twin, every time, by law. Here's why a distributor might still recommend Regular anyway — and when that's actually the right call.",
    image: '/articles/why-your-mfd-recommended-a-regular-plan.jpg',
  },
  {
    slug: 'the-nfo-trap',
    file: 'pillar1-the-nfo-trap.md',
    pillar: 'uncomfortable-truth',
    title: "The NFO Trap: Why \"New Fund Offer\" Marketing Preys on FOMO",
    description: "A ₹10 NAV isn't a discount, and a closing NFO window isn't scarcity. Here's what an NFO ad is counting on you not knowing.",
    image: '/articles/the-nfo-trap.jpg',
  },
  {
    slug: 'star-fund-manager-quit',
    file: 'pillar1-star-fund-manager-departure.md',
    pillar: 'uncomfortable-truth',
    title: "Your Star Fund Manager Just Quit. Here's What Actually Happens to Your Money.",
    description: 'A fund is run by a process, not a person — usually. Here is when a manager change is genuinely nothing, and when it actually matters.',
    image: '/articles/star-fund-manager-quit.jpg',
  },
  {
    slug: 'why-we-dont-push-sectoral-funds',
    file: 'pillar1-why-we-dont-push-sectoral-funds.md',
    pillar: 'uncomfortable-truth',
    title: "Why We Don't Push Sectoral Funds to 9 Out of 10 Clients",
    description: 'Sectoral funds often carry attractive distribution economics. Here is the actual reasoning we use before ever recommending one anyway.',
    image: '/articles/why-we-dont-push-sectoral-funds.jpg',
  },
  {
    slug: 'what-sebi-fee-disclosure-doesnt-tell-you',
    file: 'pillar1-sebi-fee-disclosure-rules.md',
    pillar: 'uncomfortable-truth',
    title: "What SEBI's Total Expense Ratio Disclosure Rules Don't Tell You",
    description: 'TER is regulated and disclosed — and almost never explained. What it includes, what it quietly leaves out, and how to actually use it.',
    image: '/articles/what-sebi-fee-disclosure-doesnt-tell-you.jpg',
  },
  {
    slug: 'decoded-cas-statement',
    file: 'pillar2-decoded-cas-statement.md',
    pillar: 'decoded',
    title: 'Decoded: A CAS Statement, Annotated Line by Line',
    description: 'Folio numbers, stamp duty, cost value vs market value — an illustrative CAS statement explained line by line, in plain English.',
    image: '/articles/decoded-cas-statement.jpg',
  },
  {
    slug: 'decoded-exit-load-fine-print',
    file: 'pillar2-decoded-exit-load.md',
    pillar: 'decoded',
    title: 'Decoded: The Exit Load Fine Print That Quietly Costs Investors Crores a Year',
    description: 'The mistake is never "I did not know exit loads exist" — it is far more specific than that. Where investors actually lose money, and how to check before you redeem.',
    image: '/articles/decoded-exit-load-fine-print.jpg',
  },
  {
    slug: 'decoded-riskometer',
    file: 'pillar2-decoded-riskometer.md',
    pillar: 'decoded',
    title: 'Decoded: Reading a Riskometer Label Like a Professional',
    description: "SEBI's six-level riskometer can change monthly without you doing anything. Here is what it actually measures, and how to use it correctly.",
    image: '/articles/decoded-riskometer.jpg',
  },
  {
    slug: 'decoded-sip-confirmation-email',
    file: 'pillar2-decoded-sip-confirmation-email.md',
    pillar: 'decoded',
    title: "Decoded: What Your SIP Confirmation Email Isn't Telling You",
    description: 'Units allotted, NAV, folio number — and nothing about your real return. Three things missing from every SIP confirmation, and where to actually find them.',
    image: '/articles/decoded-sip-confirmation-email.jpg',
  },
  {
    slug: 'why-you-bought-that-fund-because-your-cousin-did',
    file: 'pillar3-cousin-herd-behavior.md',
    pillar: 'money-psychology',
    title: 'Why You Bought That Fund Because Your Cousin Did',
    description: 'Word-of-mouth investing is more common than anyone admits — and it is not purely irrational. Here is where it actually goes wrong.',
    image: '/articles/why-you-bought-that-fund-because-your-cousin-did.jpg',
  },
  {
    slug: 'the-sip-you-forgot',
    file: 'pillar3-sip-forgot-love-letter.md',
    pillar: 'money-psychology',
    title: 'The SIP You Started and Forgot: A Love Letter to Boring Investing',
    description: 'Every serious study of investor behaviour points to the same conclusion: the investor who half-forgot their SIP is probably doing better than the one checking it daily.',
    image: '/articles/the-sip-you-forgot.jpg',
  },
  {
    slug: 'loss-aversion-is-costing-you',
    file: 'pillar3-loss-aversion.md',
    pillar: 'money-psychology',
    title: 'Loss Aversion Is Costing You More Than Bad Funds Ever Will',
    description: 'Losses feel roughly twice as painful as equivalent gains feel good. That single asymmetry explains more bad investing decisions than any specific fund choice.',
  },
  {
    slug: 'ill-start-investing-when-i-earn-more',
    file: 'pillar3-earn-more-trap.md',
    pillar: 'money-psychology',
    title: '"I\'ll Start Investing When I Earn More" Is a Trap — Here\'s the Math',
    description: 'Two illustrative investors, one starting ten years earlier and contributing less than half as much in total — the math on why the head start wins.',
  },
  {
    slug: 'indias-sip-book-milestone',
    file: 'pillar4-sip-book-milestone.md',
    pillar: 'numbers-that-matter',
    title: "India's Monthly SIP Book Just Hit ₹31,961 Crore. Here's What That Number Actually Means for You.",
    description: 'A near-10x increase in a decade is a real signal about India\'s investing culture. Here is what it does — and does not — tell you personally.',
  },
  {
    slug: 'debt-funds-lost-their-tax-edge',
    file: 'pillar4-debt-fund-tax-edge.md',
    pillar: 'numbers-that-matter',
    title: 'The Real Reason Debt Funds Lost Their Tax Edge (And What Changed for You)',
    description: 'Since April 2023, debt funds no longer automatically beat FDs on tax. What actually changed, what did not, and why the purchase date on your specific units now matters.',
  },
  {
    slug: 'pms-vs-mutual-funds',
    file: 'pillar5-pms-vs-mutual-funds.md',
    pillar: 'beyond-mutual-funds',
    title: 'PMS vs Mutual Funds: What a ₹50 Lakh Minimum Actually Buys You',
    description: 'The structural difference behind every other difference: no pooling, direct stock ownership, per-transaction tax events. What crossing the PMS threshold actually changes.',
    image: '/articles/pms-vs-mutual-funds.jpg',
  },
  {
    slug: 'sifs-first-year-of-a-new-asset-class',
    file: 'pillar5-sif-new-asset-class.md',
    pillar: 'beyond-mutual-funds',
    title: "SIFs Are Brand New. Here's What Nobody Tells You About a Fresh Asset Class's First Year",
    description: 'Specified Investment Funds allow limited long-short positioning mutual funds never could. What to actually evaluate when a category has no long track record yet.',
  },
  {
    slug: 'why-your-pms-statement-looks-different',
    file: 'pillar5-pms-statement-reading.md',
    pillar: 'beyond-mutual-funds',
    title: 'Why Your PMS Statement Looks Nothing Like Your Mutual Fund One',
    description: 'Individual stocks instead of units, per-trade tax events, TWRR instead of a simple return number. Why the two documents are built to look completely different.',
  },
  {
    slug: 'three-questions-before-any-fund-recommendation',
    file: 'pillar6-three-questions.md',
    pillar: 'advisors-notebook',
    title: 'The Three Questions I Ask Before Recommending Any Fund',
    description: 'None of them are on the factsheet. The actual filter used before any fund goes into a client plan, from someone who has to live with the recommendation.',
  },
  {
    slug: 'what-risk-actually-taught-me',
    file: 'pillar6-what-risk-actually-taught-me.md',
    pillar: 'advisors-notebook',
    title: 'What Years in This Business Actually Taught Me About Risk',
    description: 'Risk gets taught as a number. In practice, it turned out to mean something closer to behaviour — stated tolerance versus demonstrated tolerance, and what actually determines outcomes.',
  },
  {
    slug: 'reading-your-rate-journey-chart',
    file: 'pillar7-rate-journey-chart-explained.md',
    pillar: 'rate-journey',
    title: 'What Your Rate Journey Chart Is Actually Telling You',
    description: 'Every instalment you have ever made, plotted against real NAV history. How to actually read the chart most portfolio trackers never bother to show you.',
  },
  {
    slug: 'the-worst-timed-sip-instalment',
    file: 'pillar7-worst-timed-instalment.md',
    pillar: 'rate-journey',
    title: 'The SIP Instalment You Bought at the Worst Possible Time — and Why It Still Worked Out',
    description: 'An illustrative walk-through of why one badly-timed instalment matters far less than it feels like it does in the moment — and what actually hurts a SIP\'s outcome.',
  },
];

export function getArticleBySlug(slug) {
  return ARTICLES.find((a) => a.slug === slug) || null;
}

export function getArticlesByPillar() {
  const grouped = {};
  for (const key of Object.keys(PILLARS)) grouped[key] = [];
  for (const a of ARTICLES) grouped[a.pillar].push(a);
  return grouped;
}

export function getPublishedDate() {
  return PUBLISHED_DATE;
}
