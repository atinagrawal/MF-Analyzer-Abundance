# 📊 MF Risk & Return Analyzer
### by [Abundance Financial Services](https://www.getabundance.in) · ARN-251838

A free, browser-based tool to compare up to 5 mutual funds side-by-side using **live AMFI data** — no login, no app, no cost.

🔗 **Live Tool:** [MF-Analyzer-Abundance](https://mfcalc.getabundance.in/)

---

## ✨ Features

- **Live AMFI Data** — NAV history fetched in real-time via [mfapi.in](https://mfapi.in)
- **Compare up to 5 Funds** — search from the entire AMFI universe of 10,000+ schemes
- **9 Period Selectors** — 1M · 3M · 6M · 1Y · 2Y · 3Y · 5Y · 10Y · Max
- **Fair Comparison** — all funds auto-aligned to a common start date for apples-to-apples comparison
- **NAV Performance Chart** — % change rebased from period start, interactive tooltips with raw NAV values
- **Fund Metrics Tab** — Period Return, Annualised Return (CAGR), Volatility, Sharpe Ratio, Max Drawdown, Best/Worst Day, Positive Days %
- **Risk Summary Table** — per-fund independent metrics with date range pills
- **SIP Returns Calculator** — Daily/Weekly/Monthly/Quarterly/Annual SIP with step-up, 3 scenarios (Conservative / Base / Optimistic), growth chart
- **Export PNG** — download a branded snapshot of your analysis
- **Print / PDF** — print the SIP calculator results as a clean PDF
- **Mobile Friendly** — responsive design, risk table switches to card layout on small screens
- **No tracking, no ads, no login** — completely client-side

---

## 📸 Screenshots

> *(Add screenshots here)*

| NAV Performance | Fund Metrics | SIP Calculator |
|---|---|---|
| *(screenshot)* | *(screenshot)* | *(screenshot)* |

---

## 🛠 How It Works

All data is fetched live from the [mfapi.in](https://mfapi.in) public API, which serves AMFI-registered NAV data. No backend or server is needed — the entire tool runs in the browser.

```
Search Fund → Fetch NAV History → Clean & Sort Data → Compute Metrics → Render Chart
```

Key calculations:
- **CAGR** — `(Ending NAV / Starting NAV)^(1/years) - 1`
- **Annualised Volatility** — `StdDev(daily returns) × √252`
- **Sharpe Ratio** — `(Annualised Return − 6.5%) / Annualised Volatility`
- **Max Drawdown** — largest peak-to-trough decline over the period

---

## 🚀 Usage

Simply open the live link — no installation needed:

👉 [MF-Analyzer-Abundance](https://mfcalc-abundance.vercel.app/)

Or clone and open locally:

```bash
git clone https://github.com/atinagrawal/MF-Analyzer-Abundance.git
cd MF-Analyzer-Abundance
open index.html
```

---

## ⚠️ Disclaimer

Mutual fund investments are subject to market risks. Read all scheme-related documents carefully before investing. Past performance is not indicative of future returns. This tool is for **informational and educational purposes only** and does not constitute financial advice. Please consult your AMFI-registered financial advisor before making investment decisions.

Data sourced from AMFI via mfapi.in.

---

## 👤 About

**Atin Kumar Agrawal**  
AMFI Registered Mutual Funds Distributor & SIF Distributor · ARN-251838

📞 [+91 98081 05923](tel:+919808105923)  
✉️ [contact@getabundance.in](mailto:contact@getabundance.in)  
🌐 [www.getabundance.in](https://www.getabundance.in)  
🏢 1st Floor, Kapil Complex, Mukhani, Haldwani (Nainital) — 263139, Uttarakhand

[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=flat&logo=instagram&logoColor=white)](https://www.instagram.com/abundancefinancialservices/)
[![Facebook](https://img.shields.io/badge/Facebook-1877F2?style=flat&logo=facebook&logoColor=white)](https://www.facebook.com/abundancefinancialservices)
[![X](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white)](https://x.com/abundancefinsvs)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?style=flat&logo=whatsapp&logoColor=white)](https://wa.me/919808105923)

---

*Built with ❤️ for Indian mutual fund investors*
