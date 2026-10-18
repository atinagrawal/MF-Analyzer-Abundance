# Indian AMCs Direct Invest Link Survey & Integration Notes (2026-10-18)

## 1. Executive Summary

This document extends the initial invest-link investigation (`docs/superpowers/specs/2026-10-18-cams-invest-link-feasibility.md`) across **all 53 mutual fund asset management companies (AMCs) operating in India**.

Prior to this sprint, direct-invest links were automated for only 2 AMCs:
- **Carnelian Mutual Fund** (via bespoke public Inertia/Laravel portal at `partners.carnelianmf.com`)
- **HDFC Mutual Fund** (via CAMS shared `AMCLinkGenerate.aspx` tool)

Following this comprehensive survey and reverse-engineering sprint, automation coverage has expanded to **9 AMCs**, adding:
- **Tata Mutual Fund** (CAMS `QEAxF7WU045lbv4axicBOQ%3D%3D`)
- **HSBC Mutual Fund** (CAMS `kI1cDzVhVxmAs5Sw9ULj0A%3D%3D`)
- **DSP Mutual Fund** (CAMS `LMMRfFuittKgBY611m03LQ%3D%3D`)
- **Union Mutual Fund** (CAMS `1Mhr4uMyHuGMnHZyPHOeBw%3D%3D`)
- **Shriram Mutual Fund** (CAMS `sAmnlDc7U9xHX7IZpu0khg%3D%3D`)
- **PPFAS Mutual Fund (Parag Parikh)** (Bespoke public SelfInvest portal)
- **Motilal Oswal Mutual Fund** (Bespoke public Quick-Purchase REST API)

All 9 providers generate live, ARN-tagged direct transaction links (`ARN-0155`, `EUIN E468841`, `Sub-broker ARN 251838`, `Sub-broker Code 22734`) for **Regular Plan, Growth option** funds, resolve real ISINs against `mf_screener`, and sync into Cloudflare R2 (`amc-invest-links.json`).

---

## 2. Comprehensive Survey of Indian AMCs (53 Total)

Every operating AMC was evaluated against 5 mechanisms:
1. **CAMS-serviced (`AMCLinkGenerate.aspx?amc=<token>`)** — Public, anonymous form requiring ARN/EUIN validation only.
2. **KFinTech-serviced ("KFinKart Distributor" / "IRIS")** — Full login-gated dashboard (username/password); skipped per project security rules.
3. **Bespoke AMC-own portal** — Custom web portals; automated if public/anonymous (ARN/EUIN only), skipped if login-gated.
4. **WhatsApp-bot based** — Chat-based transactions requiring OTP/TPIN authentication; out of scope.
5. **Direct-to-consumer / Inactive / In-process** — App-only or unlaunched; skipped.

| # | AMC Name | Primary RTA | Mechanism | Identifier / Endpoint | Status & Reason |
|---|---|---|---|---|---|
| 1 | **360 ONE Mutual Fund** | CAMS | Bespoke Portal | `360.one` | Skipped (Login-gated partner portal) |
| 2 | **Abakkus Mutual Fund** | KFinTech | KFinKart | `mfs.kfintech.com` | Skipped (KFinTech login-gated) |
| 3 | **Aditya Birla Sun Life MF** | CAMS | Bespoke ("Partner EasyLink") | `mutualfund.adityabirlacapital.com` | Skipped (Requires distributor PAN authentication) |
| 4 | **AlphaGrep Mutual Fund** | CAMS | Bespoke Portal | `alphagrepamc.com` | Skipped (Boutique AMC, login-gated) |
| 5 | **Angel One Mutual Fund** | CAMS | App-only | `angelonemf.com` | Skipped (Direct fintech app, no public MFD link generator) |
| 6 | **ASK Mutual Fund** | CAMS | Bespoke Portal | `askfinancials.com` | Skipped (Login-gated partner portal) |
| 7 | **Axis Mutual Fund** | KFinTech | KFinKart & Partner Desk | `axismf.com` / KFinTech | Skipped (KFinTech login-gated) |
| 8 | **Bajaj Finserv Mutual Fund** | KFinTech | WhatsApp-bot & KFinKart | `+91-xxxx` & KFinTech | Skipped (WhatsApp OTP & KFin login-gated) |
| 9 | **Bandhan Mutual Fund** | CAMS | Bespoke ("Bandhan Saathi") | `bandhanmutual.com` | Skipped (ARN-password login-gated portal) |
| 10 | **Bank of India Mutual Fund** | KFinTech | KFinKart | `mfs.kfintech.com` | Skipped (KFinTech login-gated) |
| 11 | **Baroda BNP Paribas MF** | KFinTech | KFinKart | `mfs.kfintech.com` | Skipped (KFinTech login-gated) |
| 12 | **Canara Robeco Mutual Fund** | KFinTech | KFinKart | `mfs.kfintech.com` | Skipped (KFinTech login-gated) |
| 13 | **Capitalmind Mutual Fund** | KFinTech | KFinKart | `capitalmind.in` | Skipped (KFinTech login-gated) |
| 14 | **Carnelian Mutual Fund** | Other | Bespoke Inertia/Laravel API | `partners.carnelianmf.com/distributor/arn-txn-link` | **Automated** (Public Inertia JSON API, active in `sync_invest_links.js`) |
| 15 | **Choice Mutual Fund** | CAMS | Bespoke Portal | `choicemutualfund.com` | Skipped (Login-gated partner portal) |
| 16 | **DSP Mutual Fund** | CAMS | CAMS AMCLinkGenerate | `amc=LMMRfFuittKgBY611m03LQ%3D%3D` | **Automated** (Verified live, 71 schemes supported) |
| 17 | **Edelweiss Mutual Fund** | KFinTech | KFinKart & Edelweiss Galaxy | `partners.edelweissmf.com` | Skipped (KFinTech / Galaxy login-gated) |
| 18 | **Franklin Templeton MF** | CAMS | Bespoke Portal | `franklintempletonindia.com` | Skipped (Distributor portal login-gated) |
| 19 | **Groww Mutual Fund** | KFinTech | App-only & KFinKart | `groww.in` | Skipped (Fintech captive / KFinTech login-gated) |
| 20 | **HDFC Mutual Fund** | CAMS | CAMS AMCLinkGenerate | `amc=LLU2rKXO6MxsgDl5CC1fAg%3D%3D` | **Automated** (Verified live, 96 schemes supported) |
| 21 | **Helios Mutual Fund** | CAMS | Bespoke Portal | `heliosmf.com` | Skipped (Login-gated partner desk) |
| 22 | **HSBC Mutual Fund** | CAMS | CAMS AMCLinkGenerate | `amc=kI1cDzVhVxmAs5Sw9ULj0A%3D%3D` | **Automated** (Verified live, 45 schemes supported) |
| 23 | **ICICI Prudential MF** | CAMS | Bespoke ("i-Invest iPru Partner") | `partners.icicipruamc.com` | Skipped (Full credential login-gated portal) |
| 24 | **Invesco Mutual Fund** | KFinTech | KFinKart | `mfs.kfintech.com` | Skipped (KFinTech login-gated) |
| 25 | **ITI Mutual Fund** | KFinTech | KFinKart | `mfs.kfintech.com` | Skipped (KFinTech login-gated) |
| 26 | **Jio BlackRock Mutual Fund** | N/A | Inactive | `jioblackrock.com` | Skipped (Pending regulatory/operational launch) |
| 27 | **JM Financial Mutual Fund** | KFinTech | KFinKart | `mfs.kfintech.com` | Skipped (KFinTech login-gated) |
| 28 | **Kotak Mahindra Mutual Fund** | CAMS | Bespoke ("Kotak Business Hub") | `kotakmf.com` | Skipped (Login-gated distributor portal) |
| 29 | **LIC Mutual Fund** | KFinTech | KFinKart | `mfs.kfintech.com` | Skipped (KFinTech login-gated) |
| 30 | **Mahindra Manulife MF** | CAMS | Bespoke Portal | `mahindramanulife.com` | Skipped (Login-gated partner portal) |
| 31 | **Mirae Asset Mutual Fund** | KFinTech | KFinKart & Mirae Transact | `miraeassetmf.co.in` | Skipped (KFinTech login-gated) |
| 32 | **Monarch / Lakshya** | N/A | Inactive | N/A | Skipped (Unlaunched / in-process) |
| 33 | **Motilal Oswal Mutual Fund** | KFinTech | Bespoke Public REST API | `digital.motilaloswalmf.com` | **Automated** (Public Quick-Purchase cart/deeplink REST API, 29 schemes) |
| 34 | **Navi Mutual Fund** | CAMS | App-only | `navimutualfund.com` | Skipped (App-only D2C model, no MFD link tool) |
| 35 | **Nippon India Mutual Fund** | KFinTech | KFinKart & "Business Easy" | `mf.nipponindiaim.com` | Skipped (KFinTech / Business Easy login-gated) |
| 36 | **NJ Mutual Fund** | KFinTech | Captive | `njmutualfund.com` | Skipped (Internal NJ network login-gated) |
| 37 | **Old Bridge Mutual Fund** | KFinTech | KFinKart | `mfs.kfintech.com` | Skipped (KFinTech login-gated) |
| 38 | **PGIM India Mutual Fund** | KFinTech | KFinKart | `mfs.kfintech.com` | Skipped (KFinTech login-gated) |
| 39 | **PPFAS Mutual Fund (Parag Parikh)** | CAMS | Bespoke Public URL | `selfinvest.ppfas.com/investor/regular/ARN-{arn}/{euin}` | **Automated** (Public SelfInvest link generator, 7 schemes) |
| 40 | **quant Mutual Fund** | KFinTech | KFinKart | `quantmutual.com` | Skipped (KFinTech login-gated) |
| 41 | **Quantum Mutual Fund** | KFinTech | KFinKart | `quantumamc.com` | Skipped (KFinTech login-gated) |
| 42 | **Samco Mutual Fund** | KFinTech | KFinKart | `samcomf.com` | Skipped (KFinTech login-gated) |
| 43 | **SBI Mutual Fund** | CAMS | WhatsApp-bot & InTouch | `+91-xxxx` & `sbimf.com` | Skipped (WhatsApp OTP & InTouch login-gated) |
| 44 | **Shriram Mutual Fund** | CAMS | CAMS AMCLinkGenerate | `amc=sAmnlDc7U9xHX7IZpu0khg%3D%3D` | **Automated** (Verified live, 11 schemes supported) |
| 45 | **Sundaram Mutual Fund** | KFinTech | KFinKart | `sundarammutual.com` | Skipped (KFinTech login-gated) |
| 46 | **Tata Mutual Fund** | CAMS | CAMS AMCLinkGenerate | `amc=QEAxF7WU045lbv4axicBOQ%3D%3D` | **Automated** (Verified live, 79 schemes supported) |
| 47 | **Taurus Mutual Fund** | CAMS | Physical / Mailback | `taurusmutualfund.com` | Skipped (No digital link generation tool) |
| 48 | **The Wealth Company MF** | KFinTech | KFinKart | N/A | Skipped (Boutique / KFinTech login-gated) |
| 49 | **Trust Mutual Fund** | KFinTech | KFinKart | `trustmf.com` | Skipped (KFinTech login-gated) |
| 50 | **Unifi Mutual Fund** | CAMS | Bespoke Portal | `unifiamc.com` | Skipped (Boutique / login-gated) |
| 51 | **Union Mutual Fund** | CAMS | CAMS AMCLinkGenerate | `amc=1Mhr4uMyHuGMnHZyPHOeBw%3D%3D` | **Automated** (Verified live, 33 schemes supported) |
| 52 | **UTI Mutual Fund** | KFinTech | KFinKart & UTI Buddy | `utimf.com` | Skipped (KFinTech / UTI Buddy login-gated) |
| 53 | **WhiteOak Capital MF** | CAMS | Bespoke Portal | `partner.whiteoakamc.com` | Skipped (CloudFront-protected ARN/PMRN login-gated) |

---

## 3. Newly Discovered Gotchas & Implementation Quirks

### 3.1 CAMS Plan Option Naming Inversions (Union Mutual Fund)
- **The Issue**: On HDFC, Tata, DSP, and Shriram, scheme plan dropdowns consistently follow standard trailing naming:
  `"<Scheme Name> - Regular Plan - Growth"`
  However, on Union Mutual Fund's CAMS page, ELSS and select funds invert the order:
  `"Union ELSS Tax Saver Fund Growth - Regular Plan"`
  Furthermore, Union Liquid Fund lists an unadorned option:
  `"Union Liquid Fund Growth"` (where the remaining options are all IDCW variants).
- **The Fix**: In `scripts/lib/camsLinkGenerator.js`, we replaced the rigid single-direction regex with `findRegularGrowthOption(options)`:
  1. Pass 1 checks for both `regular` (or `reg`) and `growth` in any order while strictly excluding `direct` and `idcw`.
  2. Pass 2 tests `PLAN_OPTION_PATTERN`.
  3. Pass 3 matches pure `growth` without `direct`, `idcw`, `inst`, `bonus`, or `unclaimed`.
  In `scripts/sync_invest_links.js`, `stripShareClassSuffix(name)` was updated to strip both `... Growth - Regular Plan` and `... Regular Plan Growth` to reliably isolate the canonical scheme base name.

### 3.2 Motilal Oswal Public REST API & Origin Header Requirement
- **The Architecture**: While Motilal Oswal is serviced by KFinTech for registrar operations, they built a bespoke modern digital stack (`https://www.motilaloswalmf.com/quick-purchase`):
  1. `GET https://digital.motilaloswalmf.com/ncms/api/FundCategorisationMF/get-fund-details?isETF=false` with public API keys in headers returns their full fund catalog.
  2. `POST https://digital.motilaloswalmf.com/oms/api/Cart/prelogin-add-to-cart/` creates a prelogin cart tagged with distributor ARN, sub-broker ARN, and EUIN, returning a `cartId`.
  3. `POST https://digital.motilaloswalmf.com/deeplinkapi/dit-purchase-link` converts the long cart SSO URL into a short URL (`https://digital.motilaloswalmf.com/deeplinkapi/XXXX`).
- **The Gotcha**: Calling `/deeplinkapi/dit-purchase-link` without an explicit `Origin: https://www.motilaloswalmf.com` header returns HTTP 403 Forbidden with `{"message": "Origin header required"}`. Adding the `Origin` and `Referer` headers allows pure Node.js `fetch` execution with no browser overhead. If the deeplink shortener ever fails or rate-limits, the fallback `longUrl` (`https://invest.motilaloswalmf.com/mutualfund/login?returnURL=/sso&cartId=...`) is equally functional.

### 3.3 PPFAS SelfInvest URL Determinism
- **The Finding**: PPFAS Mutual Fund's public distributor tool at `https://amc.ppfas.com/distributors/create_link/` submits to `createlink.php?arn={arn}&euino={euin}`.
- **The Gotcha**: The form requires entering digits only for EUIN (without the leading 'E'). It yields an exact deterministic URL pattern:
  `https://selfinvest.ppfas.com/investor/regular/ARN-${arn}/${euin}` (e.g. `https://selfinvest.ppfas.com/investor/regular/ARN-0155/E468841`).
- **The Implementation**: Querying `mf_screener` for all PPFAS funds (`INF879O...`) allows instant, zero-latency mapping of all 7 PPFAS schemes to this verified distributor transaction link without network scraping.

---

## 4. Verification and Self-Test Results

1. **Self-Test Suite**:
   `node scripts/sync_invest_links.js --self-test` -> **ALL PASSED**
2. **Dry Run Suite**:
   Tested live with `$env:CAMS_SCHEME_LIMIT="1"; node --env-file=.env.local scripts/sync_invest_links.js --dry-run`
   - `carnelian`: 1 scheme mapped
   - `hdfc`: 1 scheme mapped via CAMS (`https://s.camsai.com/r/...`)
   - `tata`: 1 scheme mapped via CAMS (`https://s.camsai.com/r/TBreW9Hj`)
   - `hsbc`: 1 scheme mapped via CAMS (`https://s.camsai.com/r/w3tLSgvC`)
   - `dsp`: 1 scheme mapped via CAMS (`https://s.camsai.com/r/0VoUceTG`)
   - `union`: 1 scheme mapped via CAMS (`https://s.camsai.com/r/8uXfV9wh`)
   - `shriram`: 1 scheme mapped via CAMS (`https://s.camsai.com/r/KUmZmepX`)
   - `ppfas`: 7 schemes mapped (`https://selfinvest.ppfas.com/...`)
   - `motilal`: 29 schemes mapped (`https://digital.motilaloswalmf.com/deeplinkapi/...`)
3. **Application Build**:
   `npm run build` -> Clean exit (exit code 0).
