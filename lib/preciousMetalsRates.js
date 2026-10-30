/**
 * lib/preciousMetalsRates.js
 *
 * Live Gold/Silver/Platinum rates for the /gold-silver-rates page.
 *
 * Source: a public, unauthenticated ticker fragment a bullion refinery
 * (not named on our page, per product decision -- shown only as
 * "Indicative") serves to its own order-portal homepage (data-user=
 * ROLE_ANONYMOUS in the markup -- it's meant for public display, unlike
 * that site's actual trading API which requires a signed-up partner
 * account). This is an undocumented widget endpoint, not a published
 * API, so it could change shape or disappear without notice -- every
 * failure here is caught by the caller and served stale rather than
 * thrown, same "stale-over-wrong" convention as lib/bseIndex.js.
 *
 * Units (cross-checked against the refinery's own labeled retail rate
 * sheet, since the live ticker itself leaves 3 of its 6 rows unlabeled):
 *   GOLD(USD)  -- USD per troy ounce, 24K/999 gold
 *   INR        -- USD/INR exchange rate (not a metal price)
 *   Silver USD -- USD per troy ounce, 999 silver
 *   GOLD       -- INR per GRAM, 24K/999 gold
 *   SILVER     -- INR per GRAM, 999 silver
 *   Platinum   -- INR per GRAM, 999 platinum
 * Each row carries a bid (dealer buys / "you sell at") and ask (dealer
 * sells / "you buy at") -- we surface ask as the headline "buy" price.
 *
 * Unlike BSE/NSE elsewhere in this app, this endpoint has shown no sign
 * of blocking cloud/datacenter IPs, so it's fetched directly from the
 * server (Vercel function or GitHub Actions) with no GH-Actions-runner
 * workaround needed.
 */

import * as cheerio from 'cheerio';
import https from 'node:https';
import tls from 'node:tls';

const LIVE_RATES_HOST = 'api.bangalorerefinery.com';
const LIVE_RATES_PATH = '/Online-Orders/live-rates';

const GRAMS_PER_TROY_OZ = 31.1034768;
const GRAMS_PER_TOLA = 11.6638038;
const KARAT_22_PURITY = 22 / 24; // 0.91667 (916 Hallmarked)
const KARAT_18_PURITY = 18 / 24; // 0.75000 (750 Diamond Jewellery Standard)

/**
 * The refinery's server sends only its leaf certificate, omitting the
 * two intermediates a client needs to chain up to a trusted root
 * (confirmed via `openssl s_client -showcerts`: exactly 1 cert sent, and
 * `-text` shows its AIA "CA Issuers" URI). Browsers paper over this with
 * AIA chasing; Node's TLS stack does not, so plain fetch()/https fails
 * with UNABLE_TO_VERIFY_LEAF_SIGNATURE even though the chain is
 * genuinely valid. Fix: supply the two missing certs ourselves --
 * fetched directly from Let's Encrypt's own AIA endpoints referenced in
 * the certs' own "CA Issuers" fields (http://yr2.i.lencr.org/ from the
 * leaf, http://yr.i.lencr.org/ from that intermediate) -- as additional
 * trusted CAs alongside Node's full default root list. This is NOT a
 * verification bypass: rejectUnauthorized stays at its default (true),
 * hostname checking is untouched, and the chain verifies cryptographically
 * leaf -> "YR2" -> "Root YR" -> "ISRG Root X1" (already in Node's
 * bundled trust store) -- confirmed with
 * `openssl verify -CAfile <ISRG Root X1> -untrusted <YR2+RootYR> <leaf>` -> OK.
 * Root YR is a cross-sign Let's Encrypt began issuing from its newer
 * root program; Node's bundled list (frozen at build time) hasn't
 * caught up to it yet, same reason some older TLS stacks needed
 * "DST Root CA X3" supplied manually during LE's prior root transition.
 */
const LENCR_YR2_INTERMEDIATE = `-----BEGIN CERTIFICATE-----
MIIE2jCCAsKgAwIBAgIQTr0klH4k05SALYSlL9WzGTANBgkqhkiG9w0BAQsFADAu
MQswCQYDVQQGEwJVUzENMAsGA1UEChMESVNSRzEQMA4GA1UEAxMHUm9vdCBZUjAe
Fw0yNTA5MDMwMDAwMDBaFw0yODA5MDIyMzU5NTlaMDMxCzAJBgNVBAYTAlVTMRYw
FAYDVQQKEw1MZXQncyBFbmNyeXB0MQwwCgYDVQQDEwNZUjIwggEiMA0GCSqGSIb3
DQEBAQUAA4IBDwAwggEKAoIBAQDZ0LxwBppqh84luqMerV/eeL/fXQ7mLQQv1Lnp
WKZbyvGpx6wh6AfnslAnF6ewTkcHA+gSOoBvm3Dfm06AuGiF+KRut4fAcowqnAQQ
CW98+QPP/eOv/wug7Iyk4NkOxf2I6g2f55T6nJoOTLFcukeRq80JGQEYan+dPFr9
OGUgQK2hGKgNkW87pappsOAuUJcroYhRt5uUis4qaZireiseu32gzDJNBAiKtsvd
6HX4v25bpkRNcS/B/Gtc9kVbUpD+2PLPxdei3Tim55k4tfAEXwD2qyiPTxrTNq6l
N+AMr5g2c1dNqkOTwjxeV6L5lpP1rGiYvLnRaPlOqyZRPW+5AgMBAAGjge4wgesw
DgYDVR0PAQH/BAQDAgGGMBMGA1UdJQQMMAoGCCsGAQUFBwMBMBIGA1UdEwEB/wQI
MAYBAf8CAQAwHQYDVR0OBBYEFEAVLSZ57TIgnt+ach3WMh+BDIEMMB8GA1UdIwQY
MBaAFN7nW2DQIm1AKH0/DQH+pLVStFGUMDIGCCsGAQUFBwEBBCYwJDAiBggrBgEF
BQcwAoYWaHR0cDovL3lyLmkubGVuY3Iub3JnLzATBgNVHSAEDDAKMAgGBmeBDAEC
ATAnBgNVHR8EIDAeMBygGqAYhhZodHRwOi8veXIuYy5sZW5jci5vcmcvMA0GCSqG
SIb3DQEBCwUAA4ICAQB0ZUQWZ9/Yn9COEpo+JfecMnB0h0vwDm/M66IqXqw3LoaL
mx9lZvRTeDIS67PUeI3yCA2W6PKRD0/FE/G57lOmS+Xy5AaaL00ICGOqjNcCaMWW
8o8nevHOd4i4lqgtznE/28QwlcdJyF8yBiWHpnyjhEpmNWJURgOCOg2xpwRMBCsj
MScqYPtOhBeuYQvSwAEeTML2Ukh6uGuX4E14q65Ja8cdjF5bAldnP1eE4FBaAwsZ
G2fOqqrKV03Y85Nw2btedP1AtliQuJZs/Jo/gXxXdc7LrH3McgnpnbTiAncX7yES
hP6kzQejllqMCIt52HOjxDGWafS7Xw+DKwqmH+Eqy8dcbOuag/1AYlQoKNVK3F5q
Hh6tEDiMqQcLIibGKteE6iHo4A/bIScbzrhXUYuism42ZYzmc48FMVIH3qy4L84E
TdAH2gtxw0PAhvRVXp8HP7wfngpzsN/8xOTpeRSbM4+Qbc56G6+Bifmv6sk1ieQb
NA3wJdl4DDUuQSV8hBgx6zoI1ZSGORprDFux7c6rhc77QZMSRrEgomBeklervEve
86ylWmZ3WWHV6RLMi8xNvjd71r4EPIGgY7BZU/VPBkq+uA7Gb6mbJnFgV43uh3xy
LRFgxIAphIukwTGSMZZR+AI+Qnp0BYTWovHXozOf3H8r6hozEoT02JHn0AeTfA==
-----END CERTIFICATE-----`;

const LENCR_ROOT_YR_CROSS_CERT = `-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----`;

const CA_LIST = [...tls.rootCertificates, LENCR_YR2_INTERMEDIATE, LENCR_ROOT_YR_CROSS_CERT];

function postWithCompleteChain(host, path, body, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host, path, method: 'POST', headers, ca: CA_LIST, timeout: 15000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, text: data }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.end(body);
  });
}

/** Fetches and parses the live ticker fragment into a flat { bid, ask } map keyed by row label. */
export async function fetchRawTickerRows() {
  const { status, text: html } = await postWithCompleteChain(LIVE_RATES_HOST, LIVE_RATES_PATH, 'id=1', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  });
  if (status !== 200) throw new Error(`live-rates endpoint responded ${status}`);

  const $ = cheerio.load(html);
  const rows = {};
  $('table tbody tr').each((_, tr) => {
    const cells = $(tr).find('td, TD');
    if (cells.length < 3) return;
    const label = $(cells[0]).text().trim();
    const bid = parseFloat($(cells[1]).text().trim());
    const ask = parseFloat($(cells[2]).text().trim());
    if (!label || !isFinite(bid) || !isFinite(ask)) return;
    rows[label] = { bid, ask };
  });

  if (!Object.keys(rows).length) throw new Error('live-rates fragment had no parseable rows');
  return rows;
}

/**
 * Fetches the live ticker and shapes it into the fields this app's UI
 * actually needs: raw spot (USD/oz + FX) and INR-per-gram for each metal.
 */
export async function fetchLiveRates() {
  const rows = await fetchRawTickerRows();

  const goldUsdOz = rows['GOLD(USD)'];
  const usdInr = rows['INR'];
  const silverUsdOz = rows['Silver USD'];
  const goldInrGram = rows['GOLD'];
  const silverInrGram = rows['SILVER'];
  const platinumInrGram = rows['Platinum'];

  if (!goldUsdOz || !usdInr || !silverUsdOz || !goldInrGram || !silverInrGram || !platinumInrGram) {
    throw new Error(`live-rates fragment missing expected rows -- got: ${Object.keys(rows).join(', ')}`);
  }

  return { goldUsdOz, usdInr, silverUsdOz, goldInrGram, silverInrGram, platinumInrGram, ts: Date.now() };
}

function round(n, dp = 0) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export const MAJOR_CITIES_RATES_CONFIG = [
  { city: 'Mumbai', state: 'Maharashtra', offset24k10g: 0, silverOffsetKg: 0 },
  { city: 'Delhi', state: 'National Capital Region', offset24k10g: 25, silverOffsetKg: 300 },
  { city: 'Bengaluru', state: 'Karnataka', offset24k10g: 20, silverOffsetKg: 200 },
  { city: 'Chennai', state: 'Tamil Nadu', offset24k10g: 35, silverOffsetKg: 500 },
  { city: 'Hyderabad', state: 'Telangana', offset24k10g: 20, silverOffsetKg: 400 },
  { city: 'Kolkata', state: 'West Bengal', offset24k10g: 25, silverOffsetKg: 300 },
  { city: 'Ahmedabad', state: 'Gujarat', offset24k10g: 10, silverOffsetKg: 100 },
  { city: 'Pune', state: 'Maharashtra', offset24k10g: 10, silverOffsetKg: 100 },
  { city: 'Jaipur', state: 'Rajasthan', offset24k10g: 25, silverOffsetKg: 250 },
  { city: 'Lucknow', state: 'Uttar Pradesh', offset24k10g: 25, silverOffsetKg: 250 },
  { city: 'Kerala (Kochi)', state: 'Kerala', offset24k10g: 20, silverOffsetKg: 400 },
  { city: 'Patna', state: 'Bihar', offset24k10g: 30, silverOffsetKg: 350 },
  { city: 'Chandigarh', state: 'Punjab / Haryana', offset24k10g: 25, silverOffsetKg: 250 },
  { city: 'Surat', state: 'Gujarat', offset24k10g: 10, silverOffsetKg: 100 },
  { city: 'Coimbatore', state: 'Tamil Nadu', offset24k10g: 35, silverOffsetKg: 500 },
  { city: 'Bhubaneswar', state: 'Odisha', offset24k10g: 25, silverOffsetKg: 300 },
];

/**
 * Derives every retail-facing figure the page displays from the 6 raw
 * feed values -- per-gram/8g/10g/tola/100g, 24K, 22K vs 18K, per-kg silver, etc.
 * Pure function (no network), so it's trivially unit-testable and reused
 * identically by the live page and the daily snapshot script.
 */
export function deriveConversions(rates) {
  const gramsToUnit = (perGram, grams) => round(perGram * grams, grams >= 100 ? 0 : 2);

  const gold24kGram = { bid: rates.goldInrGram.bid, ask: rates.goldInrGram.ask };
  const gold22kGram = {
    bid: round(gold24kGram.bid * KARAT_22_PURITY, 2),
    ask: round(gold24kGram.ask * KARAT_22_PURITY, 2),
  };
  const gold18kGram = {
    bid: round(gold24kGram.bid * KARAT_18_PURITY, 2),
    ask: round(gold24kGram.ask * KARAT_18_PURITY, 2),
  };
  const silverGram = { bid: rates.silverInrGram.bid, ask: rates.silverInrGram.ask };
  const platinumGram = { bid: rates.platinumInrGram.bid, ask: rates.platinumInrGram.ask };

  const weightRow = (perGram, weightInGrams, label) => ({
    label,
    grams: weightInGrams,
    bid: gramsToUnit(perGram.bid, weightInGrams),
    ask: gramsToUnit(perGram.ask, weightInGrams),
  });

  const base24k10g = gold24kGram.ask * 10;
  const baseSilver1kg = silverGram.ask * 1000;
  const cityRates = MAJOR_CITIES_RATES_CONFIG.map((c) => {
    const g24k10g = Math.round(base24k10g + c.offset24k10g);
    const g22k10g = Math.round(g24k10g * KARAT_22_PURITY);
    const g18k10g = Math.round(g24k10g * KARAT_18_PURITY);
    const s1kg = Math.round(baseSilver1kg + c.silverOffsetKg);
    return {
      city: c.city,
      state: c.state,
      gold24k10g: g24k10g,
      gold22k10g: g22k10g,
      gold18k10g: g18k10g,
      silver1kg: s1kg,
    };
  });

  const goldSilverRatio = silverGram.ask > 0 ? round(gold24kGram.ask / silverGram.ask, 2) : null;

  return {
    asOf: rates.ts,
    usdInr: { bid: rates.usdInr.bid, ask: rates.usdInr.ask },
    goldUsdOz: { bid: round(rates.goldUsdOz.bid, 2), ask: round(rates.goldUsdOz.ask, 2) },
    silverUsdOz: { bid: round(rates.silverUsdOz.bid, 2), ask: round(rates.silverUsdOz.ask, 2) },
    goldSilverRatio,

    gold: {
      '24k': {
        perGram: gold24kGram,
        rows: [
          weightRow(gold24kGram, 1, '1 gram'),
          weightRow(gold24kGram, 8, '8 gram (1 Sovereign / Pavan)'),
          weightRow(gold24kGram, 10, '10 gram'),
          weightRow(gold24kGram, GRAMS_PER_TOLA, '1 tola (11.66g)'),
          weightRow(gold24kGram, 100, '100 gram (Bar)'),
        ],
      },
      '22k': {
        perGram: gold22kGram,
        rows: [
          weightRow(gold22kGram, 1, '1 gram'),
          weightRow(gold22kGram, 8, '8 gram (1 Sovereign / Pavan)'),
          weightRow(gold22kGram, 10, '10 gram'),
          weightRow(gold22kGram, GRAMS_PER_TOLA, '1 tola (11.66g)'),
          weightRow(gold22kGram, 100, '100 gram'),
        ],
      },
      '18k': {
        perGram: gold18kGram,
        rows: [
          weightRow(gold18kGram, 1, '1 gram'),
          weightRow(gold18kGram, 8, '8 gram (1 Sovereign / Pavan)'),
          weightRow(gold18kGram, 10, '10 gram'),
          weightRow(gold18kGram, GRAMS_PER_TOLA, '1 tola (11.66g)'),
        ],
      },
    },

    silver: {
      perGram: silverGram,
      rows: [
        weightRow(silverGram, 1, '1 gram'),
        weightRow(silverGram, 10, '10 gram'),
        weightRow(silverGram, GRAMS_PER_TOLA, '1 tola (11.66g)'),
        weightRow(silverGram, 100, '100 gram'),
        weightRow(silverGram, 500, '500 gram'),
        weightRow(silverGram, 1000, '1 kg'),
      ],
    },

    platinum: {
      perGram: platinumGram,
      rows: [
        weightRow(platinumGram, 1, '1 gram'),
        weightRow(platinumGram, 10, '10 gram'),
      ],
    },

    cityRates,
  };
}

export const CONSTANTS = { GRAMS_PER_TROY_OZ, GRAMS_PER_TOLA, KARAT_22_PURITY, KARAT_18_PURITY };
