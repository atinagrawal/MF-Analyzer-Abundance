import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'FAQ — Market Breadth & Technical Indicators | Abundance',
  description:
    'Plain-English explanations of market breadth, DMA breadth, advance-decline line, McClellan Oscillator, golden cross, bull/bear stacked, sector breadth, and how this dashboard is built.',
};

const SECTIONS = [
  {
    heading: 'Market breadth basics',
    items: [
      {
        q: 'What is market breadth, and why does it matter?',
        a: `Market breadth measures how many individual stocks are participating in a move, not just whether the index is up or down. An index like Nifty 50 or BSE Sensex tracks a small basket of large-cap stocks weighted by market cap, so a handful of heavy stocks can lift the index even while most stocks are falling.

Breadth tells you whether a rally or a decline is broad (most stocks moving together) or narrow (just a few leaders). Broad rallies tend to be durable; narrow ones are more fragile. A market where 80% of stocks are above their 200-day moving average is in a fundamentally different condition than one where only 30% are — even if the headline index is at the same level.`,
      },
      {
        q: 'How is this different from watching Nifty or Sensex?',
        a: `Nifty 50 is the weighted average of 50 stocks. Reliance, HDFC Bank, Infosys, and ICICI Bank alone make up roughly 35–40% of it. If those four stocks rise strongly, the index can go up even if 800 of the other 1,000 stocks on the exchange are falling.

This dashboard tracks all 1,100+ liquid BSE stocks equally. When it says "42% of stocks are above their 200-day MA," that means 42% of real companies — not 42% of market cap — are in long-term uptrends. That's a more honest picture of what most investors actually hold.`,
      },
      {
        q: 'What does the Risk-on / Risk-off regime label mean?',
        a: `The regime is derived from the percentage of stocks above their 200-day moving average:

• 60% or more → Risk-on (broad uptrend; majority of stocks in long-term upswings)
• 40–60% → Mixed / Neutral (two-sided market; no strong directional edge)
• 20–40% → Risk-off (defensive conditions; most stocks below long-term trend)
• Below 20% → Deep risk-off (broad downtrend; preserve capital, be selective)

These thresholds are approximate signal zones, not hard rules. The value is in the direction of change as much as the absolute level.`,
      },
    ],
  },
  {
    heading: 'Moving average breadth',
    items: [
      {
        q: 'What does "% above 200-day MA" mean?',
        a: `The 200-day moving average (200-day MA, or 200DMA) is the average closing price of a stock over the last 200 trading sessions — roughly 10 months. It is one of the most widely watched long-term trend filters in technical analysis.

When a stock's current price is above its 200-day MA, it is said to be in a long-term uptrend. When it is below, it is in a long-term downtrend.

"% above 200-day MA" counts what fraction of the 1,100+ tracked stocks are currently above their own 200-day MA. This is a breadth reading of long-term trend health. The higher the percentage, the more stocks are in individual uptrends.`,
      },
      {
        q: 'Why are there five DMA lines (20, 50, 100, 150, 200)?',
        a: `Each moving average represents a different time horizon:

• 20-day MA — roughly one trading month; measures short-term momentum
• 50-day MA — roughly one quarter; medium-term trend
• 100-day MA — roughly five months; intermediate trend
• 150-day MA — roughly seven months; longer intermediate trend
• 200-day MA — roughly ten months; long-term trend

Watching all five together shows whether strength (or weakness) is just a short-term blip or is embedded across multiple timeframes. When most stocks are above all five MAs simultaneously, market conditions are broadly constructive. When they are below all five, conditions are broadly deteriorating.`,
      },
      {
        q: 'What is the historical percentile rank shown on each DMA card?',
        a: `The percentile rank compares the current breadth reading against every prior reading in the database (back to March 2025). A "72nd percentile" means the current reading is higher than 72% of all historical readings.

This adds context that the raw percentage lacks. A reading of 45% above the 200-day MA could be average (if the market has typically been at 40–50%) or elevated (if the market has typically been at 20–30%). The percentile rank tells you where you are in the historical distribution.

Green = top quartile (>75th pct), amber = middle range, red = bottom quartile (<25th pct).`,
      },
    ],
  },
  {
    heading: 'Advance-decline line & McClellan Oscillator',
    items: [
      {
        q: 'What is the Advance-Decline (A-D) Line?',
        a: `Each day, the number of advancing stocks (closed higher than previous session) minus declining stocks gives a "net advance" figure. The A-D Line is the running cumulative sum of this number over time.

When the A-D Line is rising, more stocks are advancing than declining on most days — the market has broad participation. When it is falling even as the index is rising, it is a divergence warning: the rally is narrowing, driven by fewer and fewer stocks. This divergence often precedes corrections.

The A-D Line does not have a meaningful absolute level; what matters is its direction and whether it is confirming or diverging from the index trend.`,
      },
      {
        q: 'What is the McClellan Oscillator?',
        a: `The McClellan Oscillator is a momentum indicator built from the same advance-decline data. It calculates the difference between a 19-day exponential moving average (EMA) and a 39-day EMA of the daily net advances (advancing minus declining stocks).

• When the oscillator is positive and rising, short-term breadth momentum is expanding — more stocks are joining the move.
• When it is negative and falling, breadth momentum is deteriorating.
• Extreme readings (very high or very low) often signal overbought or oversold conditions.
• Crossings above/below zero are sometimes used as trend signals.

The oscillator is more sensitive and timely than the raw A-D Line; it oscillates around zero and is useful for identifying breadth thrusts or exhaustion.`,
      },
    ],
  },
  {
    heading: 'Signal definitions',
    items: [
      {
        q: 'What is a Golden Cross and a Death Cross?',
        a: `Both signals relate to the 50-day and 200-day moving averages of an individual stock:

• Golden Cross (GC): the 50-day MA crosses above the 200-day MA. This suggests that medium-term momentum has turned bullish relative to the long-term trend. It is widely considered a positive signal.

• Death Cross (DC): the 50-day MA crosses below the 200-day MA. The mirror image — medium-term momentum has turned bearish.

On this dashboard, the counts shown (e.g. "GC 3") tell you how many stocks within a sector had this crossover within the last 25 trading sessions. A sector with several fresh golden crosses is showing improved trend structure. The signal applies to the individual stocks, not the sector index itself.`,
      },
      {
        q: 'What is Bull Stacked and Bear Stacked?',
        a: `These describe a "perfect alignment" of all five moving averages for an individual stock:

• Bull Stacked (B↑): Price > 20-day MA > 50-day MA > 100-day MA > 150-day MA > 200-day MA — all in descending order. The stock is in an uptrend across every time horizon simultaneously. This is one of the strongest trend structures a stock can be in.

• Bear Stacked (B↓): Price < 20-day MA < 50-day MA < 100-day MA < 150-day MA < 200-day MA — all in ascending order (each shorter MA is below the next longer one). Every timeframe is in a downtrend simultaneously.

A sector with many bull-stacked stocks is showing exceptionally clean trend alignment. The count tells you how many stocks within the sector meet this condition today.`,
      },
      {
        q: 'What are new 52-week highs and lows?',
        a: `A stock makes a new 52-week high when its intraday high today equals or exceeds the highest point it reached over the prior 252 trading sessions (approximately one year). Similarly, a new 52-week low when its intraday low equals or goes below the lowest point of the prior year.

Expanding new highs alongside a rising index confirms strength. Expanding new lows alongside a falling index confirms weakness. The worrying combination is: index rising, but new lows expanding — it can signal that the rally is increasingly narrow and distribution is underway in the broader market.`,
      },
    ],
  },
  {
    heading: 'Sector breadth',
    items: [
      {
        q: 'What does the sector breadth grid show?',
        a: `The sector grid applies the same 200-day MA breadth calculation to each of the 15 Nifty sectoral indices individually. Instead of showing breadth for the whole market, it shows breadth for the specific group of stocks in each sector's index universe.

This lets you see which sectors are in broad uptrends (most of their stocks above the 200-day MA), which are struggling, and which are seeing fresh momentum signals (golden crosses, bull-stacked stocks). Sectors with high breadth and rising advance-decline are typically where current market leadership sits.`,
      },
      {
        q: 'Which sectors are covered, and how are stocks assigned?',
        a: `The 15 sectors covered are the standard Nifty sectoral indices: Auto, Bank, Consumer Durables, Energy, Financial Services, FMCG, Healthcare, Infrastructure, IT, Media, Metal, Oil & Gas, Pharma, PSU Bank, and Realty.

Stock-to-sector assignment uses the official NSE constituent lists for each sectoral index (downloaded weekly from NSE Archives). A stock can appear in more than one sector (for example, HDFC Bank is in both "Bank" and "Financial Services"). Breadth is computed over the actual constituent list of each index, so the universe size (∑ shown on each tile) matches the number of stocks in that Nifty index.`,
      },
      {
        q: 'What does the sector rotation panel show?',
        a: `The sector rotation panel ranks all 15 sectors from highest to lowest current 200-day MA breadth and shows the week-on-week change (▲/▼ N points) next to each. It also shows a 20-session sparkline of each sector's breadth so you can see the trajectory at a glance.

Sectors near the top with rising deltas are in a leadership position. Sectors near the bottom with falling deltas are in distribution or downtrend. Crossings from bottom to top (rapidly improving breadth with a large positive delta) can signal early-stage sector rotation worth paying attention to.`,
      },
    ],
  },
  {
    heading: 'About the data',
    items: [
      {
        q: 'Which stocks are included in the market breadth calculation?',
        a: `The dashboard tracks the top 1,100 liquid stocks on the BSE by 60-session average daily turnover. This is called the "liquid universe" and is recalculated each day using the most recent available data.

This universe is broad enough to capture the real breadth of the market (including mid- and small-cap stocks) while excluding thinly traded stocks where prices can be erratic and not meaningful. The exact universe changes slightly day-to-day as turnover rankings shift, but the composition is stable in practice.`,
      },
      {
        q: 'What data source is used, and how often does it update?',
        a: `End-of-day price data is sourced from the BSE bhavcopy — the official daily price file published by the Bombay Stock Exchange after market close. The bhavcopy is typically available between 6–7 PM IST on each trading day.

The nightly data pipeline runs at 6 PM IST on weekdays. It downloads the bhavcopy, computes all breadth metrics, per-stock signals, and sector breadth, and writes the results to the database. The dashboard reflects the data from this pipeline. If a date shows no data, either it was a market holiday or the pipeline has not yet run for that day.`,
      },
      {
        q: 'Are the moving averages adjusted for corporate actions (splits, bonuses)?',
        a: `No. All moving averages and signals on this dashboard are computed on unadjusted end-of-day closing prices from the BSE bhavcopy. Corporate actions like stock splits, bonus issues, or rights offerings can create discontinuities in the price series, which may temporarily affect individual stock signals.

Unadjusted prices are used because the BSE bhavcopy does not provide adjustment factors, and because most retail investors see unadjusted prices on their trading platforms. The breadth metrics are computed across hundreds of stocks, so the impact of any single stock's corporate action on aggregate readings is minimal.`,
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <div className="faq-page">
      <Navbar activePage="faq" />
      <div className="container">
        <div className="page-header">
          <div className="page-eyebrow">
            <span className="page-eyebrow-text">Reference · market breadth explained</span>
          </div>
          <h1 className="page-title">Frequently Asked Questions</h1>
          <p className="page-subtitle">
            Plain-English explanations of every indicator, signal, and number on the{' '}
            <a href="/market-breadth" className="faq-link">Market Breadth</a> and{' '}
            <a href="/stock-screener" className="faq-link">Stock Screener</a> pages.
          </p>
        </div>

        <div className="faq-body">
          {SECTIONS.map((section) => (
            <section key={section.heading} className="faq-section">
              <h2 className="faq-section-h">{section.heading}</h2>
              <div className="faq-items">
                {section.items.map((item) => (
                  <details key={item.q} className="faq-item">
                    <summary className="faq-q">{item.q}</summary>
                    <div className="faq-a">
                      {item.a.trim().split('\n\n').map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="faq-footer">
          <a href="/market-breadth" className="faq-cta">View Market Breadth Dashboard →</a>
          <span className="faq-footer-note">Data updates every trading day after 6 PM IST · BSE equity universe · unadjusted EOD prices</span>
        </div>
      </div>
      <Footer />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

const CSS = `
.faq-page{font-family:Raleway,sans-serif;color:var(--text);padding-bottom:60px}
.faq-link{color:var(--g2);text-decoration:none;border-bottom:1px solid var(--g-light,#a5d6a7)}
.faq-link:hover{color:var(--g1)}

.faq-body{max-width:760px;margin:0 auto}

.faq-section{margin-bottom:36px}
.faq-section-h{font:800 13px JetBrains Mono,monospace;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid var(--g-xlight,#e8f5e9)}

.faq-items{display:flex;flex-direction:column;gap:6px}

.faq-item{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;transition:box-shadow .15s}
.faq-item[open]{box-shadow:var(--shadow,0 2px 8px rgba(0,0,0,.08));border-color:var(--g-light,#a5d6a7)}
.faq-item[open] .faq-q{border-bottom:1px solid var(--border)}

.faq-q{
  list-style:none;
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:14px 18px;
  font:700 14px Raleway,sans-serif;color:var(--text);
  cursor:pointer;
  user-select:none;
}
.faq-q::-webkit-details-marker{display:none}
.faq-q::after{
  content:'＋';
  font:700 16px JetBrains Mono,monospace;color:var(--g2);
  flex:none;transition:transform .2s;
}
.faq-item[open] .faq-q::after{content:'－'}

.faq-a{padding:16px 20px 18px;font-size:13.5px;line-height:1.75;color:var(--text2)}
.faq-a p{margin:0 0 12px}
.faq-a p:last-child{margin-bottom:0}

.faq-footer{
  max-width:760px;margin:32px auto 0;
  display:flex;flex-direction:column;align-items:center;gap:10px;
  text-align:center;
}
.faq-cta{
  display:inline-block;padding:12px 28px;
  background:var(--g1);color:#fff;border-radius:10px;
  font:700 14px Raleway,sans-serif;text-decoration:none;
  transition:background .15s;
}
.faq-cta:hover{background:var(--g2)}
.faq-footer-note{font:500 11.5px JetBrains Mono,monospace;color:var(--muted)}

@media(max-width:600px){
  .faq-q{font-size:13px;padding:12px 14px}
  .faq-a{padding:13px 16px 15px;font-size:13px}
}
`;
