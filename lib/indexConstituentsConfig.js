/**
 * lib/indexConstituentsConfig.js
 *
 * Master configuration for 64 high-intent Phase 1 Indian Market Indices (NSE & BSE).
 * Provides metadata, descriptions, category groupings, and dual-source ingestion configs.
 */

export const INDEX_CONSTITUENTS_CONFIG = [
  {
    "slug": "nifty-50",
    "name": "Nifty 50",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 50,
    "description": "The flagship benchmark of the National Stock Exchange of India (NSE), tracking 50 of the largest and most liquid Indian companies across key sectors. Rebalanced semi-annually using free-float market capitalization.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv"
    }
  },
  {
    "slug": "nifty-next-50",
    "name": "Nifty Next 50",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 50,
    "description": "Represents 50 potential large-cap leaders ranked 51-100 by free-float market capitalization from the Nifty 100 universe, offering exposure to fast-growing emerging blue-chips.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftynext50list.csv"
    }
  },
  {
    "slug": "nifty-100",
    "name": "Nifty 100",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 100,
    "description": "A diversified broad market benchmark comprising the top 100 companies by market capitalization on the NSE (Nifty 50 + Nifty Next 50), covering approximately 70% of India’s traded market cap.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty100list.csv"
    }
  },
  {
    "slug": "nifty-200",
    "name": "Nifty 200",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 200,
    "description": "Designed to reflect the performance of India’s large and mid-market capitalization segments, consisting of the top 200 liquid companies listed on the NSE.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty200list.csv"
    }
  },
  {
    "slug": "nifty-500",
    "name": "Nifty 500",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 501,
    "description": "The definitive broad market benchmark representing the top 500 companies listed on the National Stock Exchange of India, covering over 90% of total market capitalization.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv"
    }
  },
  {
    "slug": "nifty-midcap-150",
    "name": "Nifty Midcap 150",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 150,
    "description": "Tracks the performance of 150 mid-market capitalization companies ranked 101 to 250 in the Nifty 500 universe, serving as the industry standard benchmark for mid-cap mutual funds.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftymidcap150list.csv"
    }
  },
  {
    "slug": "nifty-midcap-50",
    "name": "Nifty Midcap 50",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 50,
    "description": "Monitors the 50 most liquid and largest mid-cap companies on the NSE, with active trading in equity derivatives.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftymidcap50list.csv"
    }
  },
  {
    "slug": "nifty-smallcap-250",
    "name": "Nifty Smallcap 250",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 251,
    "description": "Represents the performance of 250 emerging small-cap companies ranked 251 to 500 in the Nifty 500 universe, standard benchmark for Indian small-cap equity funds.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftysmallcap250list.csv"
    }
  },
  {
    "slug": "nifty-smallcap-50",
    "name": "Nifty Smallcap 50",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 50,
    "description": "Tracks the 50 most liquid and heavily traded small-cap stocks from the Nifty Smallcap 250 universe.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftysmallcap50list.csv"
    }
  },
  {
    "slug": "nifty-largemidcap-250",
    "name": "Nifty LargeMidcap 250",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 250,
    "description": "Combines large-cap (Nifty 100) and mid-cap (Nifty Midcap 150) equities with a target 50:50 allocation, rebalanced quarterly.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftylargemidcap250list.csv"
    }
  },
  {
    "slug": "nifty-midsmallcap-400",
    "name": "Nifty MidSmallcap 400",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 401,
    "description": "Consists of the 150 mid-cap and 250 small-cap companies of the Nifty 500 universe, tracking the broader domestic growth story beyond mega-caps.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftymidsmallcap400list.csv"
    }
  },
  {
    "slug": "nifty-midcap-100",
    "name": "Nifty Midcap 100",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 100,
    "description": "Designed to capture the movement of top 100 mid-cap companies based on full market capitalization and average daily turnover.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftymidcap100list.csv"
    }
  },
  {
    "slug": "nifty-smallcap-100",
    "name": "Nifty Smallcap 100",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 100,
    "description": "Tracks 100 premier small-cap companies listed on the NSE, reflecting agile high-growth domestic manufacturing and services enterprises.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftysmallcap100list.csv"
    }
  },
  {
    "slug": "nifty500-multicap-50-25-25",
    "name": "Nifty500 Multicap 50:25:25",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 501,
    "description": "SEBI-aligned multicap index enforcing a disciplined 50% Large-Cap, 25% Mid-Cap, and 25% Small-Cap weight distribution across the Nifty 500 universe.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500Multicap502525_list.csv"
    }
  },
  {
    "slug": "nifty-microcap-250",
    "name": "Nifty Microcap 250",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 254,
    "description": "Tracks the performance of 250 companies ranked 501 to 750 by market capitalization, offering exposure to the early-stage listed micro-cap universe.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftymicrocap250_list.csv"
    }
  },
  {
    "slug": "nifty-midcap-select",
    "name": "Nifty Midcap Select",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 25,
    "description": "Tracks 25 liquid mid-cap stocks selected from the Nifty Midcap 150 universe, powering weekly and monthly index derivatives trading.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftymidcapselect_list.csv"
    }
  },
  {
    "slug": "nifty-total-market",
    "name": "Nifty Total Market",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 755,
    "description": "The most comprehensive equity index in India, tracking 750 listed companies covering approximately 96% of the free-float market capitalization on the NSE.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftytotalmarket_list.csv"
    }
  },
  {
    "slug": "nifty500-largemidsmall-equal-cap-weighted",
    "name": "Nifty500 LargeMidSmall Equal-Cap Weighted",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 501,
    "description": "Applies an equal 33.33% weight allocation to Large-Cap, Mid-Cap, and Small-Cap segments of the Nifty 500 universe.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500LargeMidSmallEqualCapWeighted_list.csv"
    }
  },
  {
    "slug": "nifty-smallcap-500",
    "name": "Nifty Smallcap 500",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 505,
    "description": "Captures the performance of the broader small-cap and micro-cap spectrum on the NSE.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_NiftySmallcap500_list.csv"
    }
  },
  {
    "slug": "nifty-midsmallcap400-50-50",
    "name": "Nifty MidSmallcap400 50:50",
    "exchange": "NSE",
    "category": "Broad Market",
    "constituentCount": 401,
    "description": "Equal 50:50 weight split between the Nifty Midcap 150 and Nifty Smallcap 250 universes.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftyMidSmallcap4005050_list.csv"
    }
  },
  {
    "slug": "nifty100-alpha-30",
    "name": "Nifty100 Alpha 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Single-factor strategy index selecting 30 high-alpha stocks with highest Jensen’s Alpha over a 1-year trailing period from the Nifty 100 universe.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty100Alpha30list.csv"
    }
  },
  {
    "slug": "nifty100-equal-weight",
    "name": "Nifty100 Equal Weight",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 100,
    "description": "Allocates an identical 1% portfolio weight to all 100 companies in the Nifty 100 universe, reducing mega-cap concentration risk.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty100list.csv"
    }
  },
  {
    "slug": "nifty100-low-volatility-30",
    "name": "Nifty100 Low Volatility 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Selects 30 least volatile stocks from the Nifty 100 universe based on standard deviation of daily price changes over the past year.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty100lowvolatility30list.csv"
    }
  },
  {
    "slug": "nifty100-quality-30",
    "name": "Nifty100 Quality 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Selects 30 high-quality companies from Nifty 100 based on Return on Equity (ROE), financial leverage (Debt/Equity), and earnings per share (EPS) growth stability.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty100Quality30list.csv"
    }
  },
  {
    "slug": "nifty200-alpha-30",
    "name": "Nifty200 Alpha 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Tracks 30 top alpha-generating companies selected from the broader Nifty 200 universe.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty200alpha30_list.csv"
    }
  },
  {
    "slug": "nifty200-momentum-30",
    "name": "Nifty200 Momentum 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Flagship momentum index tracking 30 stocks with highest 6-month and 12-month normalized price momentum from the Nifty 200.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty200Momentum30_list.csv"
    }
  },
  {
    "slug": "nifty200-quality-30",
    "name": "Nifty200 Quality 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Selects 30 premier companies from Nifty 200 exhibiting superior profitability, low leverage, and smooth earnings trajectory.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty200Quality30_list.csv"
    }
  },
  {
    "slug": "nifty200-value-30",
    "name": "Nifty200 Value 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Value-oriented strategy tracking 30 companies from the Nifty 200 based on attractive P/E, P/B, and Dividend Yield metrics.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty200Value30_list.csv"
    }
  },
  {
    "slug": "nifty500-equal-weight",
    "name": "Nifty500 Equal Weight",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 501,
    "description": "Assigns an equal 0.2% weight to all 500 constituents of the Nifty 500, democratizing market exposure across capitalization spectrums.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500EqualWeight_list.csv"
    }
  },
  {
    "slug": "nifty500-flexicap-quality-30",
    "name": "Nifty500 Flexicap Quality 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Multi-cap quality factor strategy tracking 30 high-ROE and low-debt companies across large, mid, and small cap tiers.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500FlexicapQuality30_list.csv"
    }
  },
  {
    "slug": "nifty500-low-volatility-50",
    "name": "Nifty500 Low Volatility 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Monitors 50 least volatile stocks across the broad 500-stock universe, providing defensive market participation.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500LowVolatility50_list.csv"
    }
  },
  {
    "slug": "nifty500-momentum-50",
    "name": "Nifty500 Momentum 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Tracks 50 highest-momentum stocks across the full market capitalization spectrum of the Nifty 500.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500Momentum50_list.csv"
    }
  },
  {
    "slug": "nifty500-multicap-momentum-quality-50",
    "name": "Nifty500 Multicap Momentum Quality 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Multi-factor strategy blending price momentum and balance-sheet quality metrics across 50 multi-cap constituents.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500MulticapMomentumQuality50_list.csv"
    }
  },
  {
    "slug": "nifty500-multifactor-mqvlv-50",
    "name": "Nifty500 Multifactor MQVLv 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Four-factor diversified strategy blending Momentum, Quality, Value, and Low Volatility to balance risk and return across market cycles.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500MultifactorMQVLv50_list.csv"
    }
  },
  {
    "slug": "nifty500-quality-50",
    "name": "Nifty500 Quality 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Selects 50 high-quality companies from the Nifty 500 characterized by high capital efficiency and stable earnings growth.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500Quality50_list.csv"
    }
  },
  {
    "slug": "nifty500-value-50",
    "name": "Nifty500 Value 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Selects 50 deeply valued stocks across the Nifty 500 offering margin of safety across price-to-earnings and price-to-book ratios.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty500Value50_list.csv"
    }
  },
  {
    "slug": "nifty50-equal-weight",
    "name": "Nifty50 Equal Weight",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Assigns equal 2% portfolio weighting to each of the 50 stocks in Nifty 50, mitigating single-stock mega-cap concentration.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_Nifty50EqualWeight.csv"
    }
  },
  {
    "slug": "nifty50-value-20",
    "name": "Nifty50 Value 20",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 20,
    "description": "Selects 20 value-oriented blue-chip companies from the Nifty 50 universe based on Return on Capital Employed (ROCE), P/E, P/B, and Dividend Yield.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_Nifty50_Value20.csv"
    }
  },
  {
    "slug": "nifty-alpha-50",
    "name": "Nifty Alpha 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Tracks 50 high-beta, high-alpha outperforming stocks listed on the National Stock Exchange.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty_Alpha_Index.csv"
    }
  },
  {
    "slug": "nifty-alpha-low-volatility-30",
    "name": "Nifty Alpha Low-Volatility 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Two-factor strategy combining high alpha generation with low historical volatility to capture superior risk-adjusted returns.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty_alpha_lowvol30list.csv"
    }
  },
  {
    "slug": "nifty-alpha-quality-low-volatility-30",
    "name": "Nifty Alpha Quality Low-Volatility 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Three-factor strategy screening for superior profitability (Quality), excess returns (Alpha), and muted price fluctuations (Low Volatility).",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty_alpha_quality_lowvol30list.csv"
    }
  },
  {
    "slug": "nifty-alpha-quality-value-low-volatility-30",
    "name": "Nifty Alpha Quality Value Low-Volatility 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Four-factor smart-beta index capturing Quality, Alpha, Value, and Low Volatility factors across liquid NSE equities.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty_alpha_quality_value_lowvol30list.csv"
    }
  },
  {
    "slug": "nifty-dividend-opportunities-50",
    "name": "Nifty Dividend Opportunities 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Tracks 50 high-dividend-yielding companies with proven track records of consistent dividend payouts.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftydivopp50list.csv"
    }
  },
  {
    "slug": "nifty-growth-sectors-15",
    "name": "Nifty Growth Sectors 15",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 15,
    "description": "Tracks 15 companies from high-growth sectors characterized by superior P/E multiples and historical revenue expansion.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_NiftyGrowth_Sectors15_Index.csv"
    }
  },
  {
    "slug": "nifty-high-beta-50",
    "name": "Nifty High Beta 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Monitors 50 high-beta stocks with high sensitivity to broad market movements, ideal for aggressive cyclical positioning.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/nifty_High_Beta50_Index.csv"
    }
  },
  {
    "slug": "nifty-low-volatility-50",
    "name": "Nifty Low Volatility 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Defensive factor index tracking 50 stocks with lowest price fluctuation over the trailing one-year horizon.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/nifty_low_Volatility50_Index.csv"
    }
  },
  {
    "slug": "nifty-midcap150-momentum-50",
    "name": "Nifty Midcap150 Momentum 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Captures top 50 momentum-driven mid-cap stocks exhibiting highest price trend persistence within the Nifty Midcap 150.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftymidcap150momentum50_list.csv"
    }
  },
  {
    "slug": "nifty-midcap150-quality-50",
    "name": "Nifty Midcap150 Quality 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Selects 50 high-quality mid-cap companies with robust balance sheets and high Return on Equity.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftymidcap150quality50list.csv"
    }
  },
  {
    "slug": "nifty-midsmallcap400-momentum-quality-100",
    "name": "Nifty MidSmallcap400 Momentum Quality 100",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 100,
    "description": "Dual-factor strategy tracking 100 momentum and quality leaders across mid and small capitalization equities.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftyMidSmallcap400MomentumQuality100_list.csv"
    }
  },
  {
    "slug": "nifty-quality-low-volatility-30",
    "name": "Nifty Quality Low-Volatility 30",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 30,
    "description": "Smart-beta strategy combining balance-sheet strength and low market fluctuation across 30 selected companies.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_nifty_quality_lowvol30list.csv"
    }
  },
  {
    "slug": "nifty-smallcap250-momentum-quality-100",
    "name": "Nifty Smallcap250 Momentum Quality 100",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 100,
    "description": "Blends momentum and balance sheet quality across 100 high-potential small-cap enterprises.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftySmallcap250MomentumQuality100_list.csv"
    }
  },
  {
    "slug": "nifty-smallcap250-quality-50",
    "name": "Nifty Smallcap250 Quality 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Screens the top 50 fundamentally sound, profitable small-cap companies from the Nifty Smallcap 250 universe.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftySmallcap250_Quality50_list.csv"
    }
  },
  {
    "slug": "nifty-top-10-equal-weight",
    "name": "Nifty Top 10 Equal Weight",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 10,
    "description": "Equal 10% weight allocation across the top 10 mega-cap blue-chip leaders of India.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftytop10EqualWeight_list.csv"
    }
  },
  {
    "slug": "nifty-top-15-equal-weight",
    "name": "Nifty Top 15 Equal Weight",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 15,
    "description": "Equal-weighted basket tracking the 15 largest market leaders of the National Stock Exchange.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftytop15EqualWeight_list.csv"
    }
  },
  {
    "slug": "nifty-top-20-equal-weight",
    "name": "Nifty Top 20 Equal Weight",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 20,
    "description": "Equal 5% weighting across the 20 largest market capitalization giants of corporate India.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftyTop20EqualWeight_list.csv"
    }
  },
  {
    "slug": "nifty-total-market-momentum-quality-50",
    "name": "Nifty Total Market Momentum Quality 50",
    "exchange": "NSE",
    "category": "Strategy / Factor",
    "constituentCount": 50,
    "description": "Combines momentum and fundamental quality screens across the entire 750-stock total market universe.",
    "fetchConfig": {
      "type": "NSE_CSV",
      "csvUrl": "https://www.niftyindices.com/IndexConstituent/ind_niftyTotalMarketMomentumQuality50_list.csv"
    }
  },
  {
    "slug": "bse-sensex",
    "name": "BSE SENSEX",
    "exchange": "BSE",
    "category": "Broad Market",
    "constituentCount": 30,
    "description": "India’s oldest and most iconic stock market benchmark, tracking 30 financially sound, well-established and large-cap companies listed on BSE across core economic sectors.",
    "fetchConfig": {
      "type": "BSE_JSON",
      "bseCode": 16
    }
  },
  {
    "slug": "bse-500",
    "name": "BSE 500",
    "exchange": "BSE",
    "category": "Broad Market",
    "constituentCount": 500,
    "description": "Broad market index tracking the top 500 companies listed on BSE, representing over 93% of the total market capitalization of the exchange.",
    "fetchConfig": {
      "type": "BSE_JSON",
      "bseCode": 17
    }
  },
  {
    "slug": "bse-100",
    "name": "BSE 100",
    "exchange": "BSE",
    "category": "Broad Market",
    "constituentCount": 100,
    "description": "Broad market benchmark tracking 100 established large-cap leaders listed on the BSE.",
    "fetchConfig": {
      "type": "BSE_JSON",
      "bseCode": 22
    }
  },
  {
    "slug": "bse-200",
    "name": "BSE 200",
    "exchange": "BSE",
    "category": "Broad Market",
    "constituentCount": 200,
    "description": "Comprehensive index comprising 200 large and mid-sized companies listed on the BSE.",
    "fetchConfig": {
      "type": "BSE_JSON",
      "bseCode": 23
    }
  },
  {
    "slug": "bse-midcap",
    "name": "BSE MidCap",
    "exchange": "BSE",
    "category": "Broad Market",
    "constituentCount": 157,
    "description": "Tracks the performance of companies with market capitalization immediately below the BSE 100 universe, representing mid-sized corporate India.",
    "fetchConfig": {
      "type": "BSE_JSON",
      "bseCode": 81
    }
  },
  {
    "slug": "bse-smallcap",
    "name": "BSE SmallCap",
    "exchange": "BSE",
    "category": "Broad Market",
    "constituentCount": 250,
    "description": "Tracks the emerging growth universe of small-cap companies listed on the BSE.",
    "fetchConfig": {
      "type": "BSE_JSON",
      "bseCode": 103
    }
  },
  {
    "slug": "bse-sensex-50",
    "name": "BSE SENSEX 50",
    "exchange": "BSE",
    "category": "Broad Market",
    "constituentCount": 50,
    "description": "Tracks 50 largest and most liquid companies listed on the BSE, offering a competitive benchmark to the Nifty 50.",
    "fetchConfig": {
      "type": "BSE_JSON",
      "bseCode": 98
    }
  },
  {
    "slug": "bse-sensex-next-50",
    "name": "BSE SENSEX Next 50",
    "exchange": "BSE",
    "category": "Broad Market",
    "constituentCount": 50,
    "description": "Tracks the next 50 largest companies after the BSE SENSEX 50, capturing the next generation of large-cap market leaders.",
    "fetchConfig": {
      "type": "BSE_JSON",
      "bseCode": 99
    }
  }
];

export const SLUG_TO_INDEX = Object.freeze(
  INDEX_CONSTITUENTS_CONFIG.reduce((acc, idx) => {
    acc[idx.slug] = idx;
    return acc;
  }, {})
);

export function getAllIndexSlugs() {
  return INDEX_CONSTITUENTS_CONFIG.map((idx) => idx.slug);
}

export function getIndexConfigBySlug(slug) {
  if (!slug) return null;
  return SLUG_TO_INDEX[slug.toLowerCase()] || null;
}
