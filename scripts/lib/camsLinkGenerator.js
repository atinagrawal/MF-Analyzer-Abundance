/**
 * scripts/lib/camsLinkGenerator.js
 *
 * Puppeteer-driven link generator for mycams.camsonline.com's
 * "AMCLinkGenerate" tool -- see docs/superpowers/specs/
 * 2026-10-18-cams-invest-link-feasibility.md for how this tool was found
 * and why it needs a real browser rather than the plain-fetch approach
 * scripts/carnelian-invest-link.mjs uses: it's classic ASP.NET WebForms
 * with AJAX UpdatePanel postbacks, and -- confirmed live -- selecting a
 * new scheme resets the ARN/EUIN/sub-broker fields, so each scheme needs
 * its own full "search for my ARN -> fill broker details -> Generate"
 * round trip in that exact order (broker details filled LAST, scheme
 * selected FIRST). Scripting that sequence by replaying real page
 * interactions is far more robust than reverse-engineering the raw
 * __VIEWSTATE/ScriptManager1 postback wire format by hand.
 *
 * Only ever "Regular Growth" plans, matching this whole feature's scope
 * rule (see lib/nfoInvestLinks.js, scripts/carnelian-invest-link.mjs).
 *
 * Each AMC in CAMS_AMCS is a distinct `?amc=<id>` page -- same tool,
 * different fund house. Add an entry here to cover another CAMS-serviced
 * AMC; nothing else in this file is HDFC-specific.
 */

const CAMS_LINK_PAGE = 'https://mycams.camsonline.com/camsapp/Admin/AMCLinkGenerate.aspx';

const CAMS_AMCS = {
  hdfc: {
    displayName: 'HDFC Mutual Fund',
    amcParam: 'LLU2rKXO6MxsgDl5CC1fAg%3D%3D',
  },
  tata: {
    displayName: 'Tata Mutual Fund',
    amcParam: 'QEAxF7WU045lbv4axicBOQ%3D%3D',
  },
  hsbc: {
    displayName: 'HSBC Mutual Fund',
    amcParam: 'kI1cDzVhVxmAs5Sw9ULj0A%3D%3D',
  },
  dsp: {
    displayName: 'DSP Mutual Fund',
    amcParam: 'LMMRfFuittKgBY611m03LQ%3D%3D',
  },
  union: {
    displayName: 'Union Mutual Fund',
    amcParam: '1Mhr4uMyHuGMnHZyPHOeBw%3D%3D',
  },
  shriram: {
    displayName: 'Shriram Mutual Fund',
    amcParam: 'sAmnlDc7U9xHX7IZpu0khg%3D%3D',
  },
};

// Public AMFI-issued distributor identifiers (ARN/EUIN), not secrets --
// same identifiers already used for Carnelian (scripts/carnelian-invest-link.mjs)
// and verified manually for this exact CAMS tool. Overridable via env.
const BROKER_SEARCH_NAME = process.env.CAMS_BROKER_SEARCH_NAME || 'NJ IndiaInvest';
const ARN_CODE = process.env.CAMS_ARN_CODE || 'ARN-0155'; // exact text to match in the broker-search results grid
const EUIN = process.env.CAMS_EUIN || 'E468841';
const SUB_BROKER_CODE = process.env.CAMS_SUB_BROKER_CODE || '22734';
const SUB_BROKER_ARN = process.env.CAMS_SUB_BROKER_ARN || '251838';

// CAMS's own plan/option text varies across AMCs:
// - Standard (HDFC, Tata, DSP): "HDFC Flexi Cap Fund - Regular Plan - Growth"
// - Inverted (Union ELSS): "Union ELSS Tax Saver Fund Growth - Regular Plan"
// - Unadorned Growth (Union Liquid): "Union Liquid Fund Growth" (where other plans are IDCW)
// findRegularGrowthOption handles all these variants in priority order.
const PLAN_OPTION_PATTERN = /regular\s*-?\s*(plan)?\s*-?\s*growth(\s*option)?\s*$/i;

function findRegularGrowthOption(options) {
  // Pass 1: explicit regular (or reg) + growth in either order, excluding direct / idcw
  const p1 = options.find((o) => /(?=.*growth)(?=.*\breg(ular)?\b)(?!.*direct)(?!.*idcw)/i.test(o.text));
  if (p1) return p1;
  // Pass 2: standard regex pattern match
  const p2 = options.find((o) => PLAN_OPTION_PATTERN.test(o.text));
  if (p2) return p2;
  // Pass 3: growth option with no direct / idcw / institutional / bonus / unclaimed
  const p3 = options.find((o) => /(?=.*growth)(?!.*(direct|idcw|inst|bonus|unclaimed))/i.test(o.text));
  return p3 || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Puppeteer's real page.click() refuses custom-styled radio inputs this
// page hides behind their <label> (confirmed live: "Node is either not
// clickable or not an Element" on #rdoNONNFO) -- a programmatic .click()
// bypasses that visibility check, which is fine here since these are
// genuinely interactive controls, just styled unconventionally.
async function evalClick(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.click();
  }, selector);
}

async function setFieldValue(page, id, value) {
  await page.evaluate(
    (elId, val) => {
      const el = document.getElementById(elId);
      if (!el) return;
      el.focus();
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    },
    id,
    value
  );
}

// Selects an option in one of this page's Select2-wrapped <select>
// elements and fires the change through jQuery -- the native-only
// dispatchEvent path doesn't reliably reach Select2's own handlers.
async function selectOption(page, selectId, optionValue, resetSelectId) {
  await page.evaluate(
    (id, val, resetId) => {
      // Clears the dependent dropdown (ddlschemetype after a scheme
      // change) down to just its placeholder BEFORE triggering the new
      // postback -- confirmed live: without this, waitForPlanOptions'
      // "options.length > 1" check can pass instantly on the PREVIOUS
      // scheme's still-present options if this scheme's own postback is
      // slow to land, silently matching stale plan data instead of
      // genuinely waiting for this scheme's own. That bug looked like
      // every scheme after the first few succeeding with no log output
      // at all -- it was quietly hitting the cache via a stale plan name.
      if (resetId) {
        const resetSel = document.getElementById(resetId);
        if (resetSel) resetSel.innerHTML = '<option value="">Select Scheme Plan &amp; Option</option>';
      }
      const sel = document.getElementById(id);
      sel.value = val;
      if (window.jQuery) jQuery(sel).trigger('change');
      else sel.dispatchEvent(new Event('change', { bubbles: true }));
    },
    selectId,
    optionValue,
    resetSelectId || null
  );
}

// Every "Regular ... Growth" scheme currently in the HDFC (or other CAMS
// AMC) Non-NFO scheme list -- the full option list ships directly in the
// DOM on page load (confirmed live: no postback needed to read it), only
// the Plan & Option list needs one postback per scheme to populate.
async function listRegularGrowthSchemes(page) {
  return page.evaluate(() => {
    const sel = document.getElementById('ddsubfundcode');
    return Array.from(sel.options)
      .filter((o) => o.value)
      .map((o) => ({ value: o.value, text: o.text }));
  });
}

async function waitForPlanOptions(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => {
      const sel = document.getElementById('ddlschemetype');
      return sel && sel.options.length > 1;
    },
    { timeout: timeoutMs }
  );
  return page.evaluate(() => {
    const sel = document.getElementById('ddlschemetype');
    return Array.from(sel.options)
      .filter((o) => o.value)
      .map((o) => ({ value: o.value, text: o.text }));
  });
}

// The one-time "find my ARN" flow -- repeated per scheme because
// selecting a scheme resets these fields (see this file's header).
async function fillBrokerDetails(page) {
  await evalClick(page, '#C_Broker');
  await page.waitForSelector('#myPopup.show, #myPopup[style*="display: block"]', { timeout: 10000 }).catch(() => {});
  await sleep(400); // modal open transition
  if (process.env.CAMS_DEBUG) console.log('  [debug] modal opened');

  // A synthetic .click() on #rbbrok fires its onclick, but the resulting
  // brkcheckedChanged() call (which un-disables #txtbrok) doesn't reliably
  // take effect through that path (confirmed live: #txtbrok stayed
  // disabled, so its value was never actually submitted -- a disabled
  // field is excluded from form submission entirely, which is why the
  // search silently returned no results). Driving the same state change
  // directly is reliable where replaying the click event wasn't.
  await page.evaluate(() => {
    document.getElementById('rbbrok').checked = true;
    brkcheckedChanged();
  });
  await setFieldValue(page, 'txtbrok', BROKER_SEARCH_NAME);
  await evalClick(page, '#btarnretrive');

  // The results-grid postback's timing isn't constant (confirmed live: a
  // fixed sleep here was the actual source of the flakiness, not the
  // click/field-fill steps themselves) -- poll until either the grid has
  // rows or the page's own "no results" message appears.
  await page.waitForFunction(
    () => document.querySelectorAll('#myPopup a').length > 0 || (document.getElementById('lbinfo')?.innerText || '').trim().length > 0,
    { timeout: 15000 }
  );
  if (process.env.CAMS_DEBUG) console.log('  [debug] grid/lbinfo ready');

  const clicked = await page.evaluate((arnCode) => {
    const links = Array.from(document.querySelectorAll('#myPopup a'));
    const match = links.find((a) => a.textContent.trim() === arnCode);
    if (!match) return false;
    match.click();
    return true;
  }, ARN_CODE);
  if (!clicked) throw new Error(`Broker search for "${BROKER_SEARCH_NAME}" had no exact "${ARN_CODE}" row.`);
  if (process.env.CAMS_DEBUG) console.log('  [debug] clicked ARN row');

  // Wait for the real effect of that click (ARN field populated, modal
  // gone) rather than guessing how long its postback takes.
  await page.waitForFunction(
    (arnCode) => (document.getElementById('txtarn')?.value || '').includes(arnCode),
    { timeout: 10000 },
    ARN_CODE
  );
  if (process.env.CAMS_DEBUG) console.log('  [debug] ARN field populated');

  await setFieldValue(page, 'txtSubbrokercode', SUB_BROKER_CODE);
  await setFieldValue(page, 'txtSubbrokerarn', SUB_BROKER_ARN);
  await setFieldValue(page, 'txtEuin', EUIN);
  await sleep(800); // EUIN's own onchange postback -- nothing to poll for afterward, a short settle is enough
  if (process.env.CAMS_DEBUG) console.log('  [debug] broker details filled');
}

async function clickGenerateAndReadLink(page) {
  await evalClick(page, '#btnSubmit');
  await page.waitForFunction(
    () => /https?:\/\/s\.camsai\.com\//.test(document.body.innerText),
    { timeout: 15000 }
  );
  return page.evaluate(() => {
    const m = document.body.innerText.match(/https?:\/\/s\.camsai\.com\/\S+/);
    return m ? m[0] : null;
  });
}

/**
 * Generates (or reuses) an invest link for every Regular-Growth scheme
 * of one CAMS-serviced AMC.
 *
 * @param {string} amcKey - key into CAMS_AMCS
 * @param {Record<string,string>} existingBySchemeName - this AMC's previous
 *   bySchemeName map (normalized name -> link), so an already-generated
 *   link is reused rather than recreated every run (same politeness
 *   rationale as scripts/sync_invest_links.js's Carnelian provider).
 * @param {object} puppeteer - the `puppeteer` module, passed in so this
 *   file has no hard dependency on it being installed outside a CAMS sync run.
 * @returns {Promise<{bySchemeName: Record<string,string>}>}
 */
async function fetchCamsLinksForAmc(amcKey, existingBySchemeName, puppeteer, { limit, nameFilter } = {}) {
  const amc = CAMS_AMCS[amcKey];
  if (!amc) throw new Error(`Unknown CAMS AMC key "${amcKey}"`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const bySchemeName = {};
  try {
    const page = await browser.newPage();
    await page.goto(`${CAMS_LINK_PAGE}?amc=${amc.amcParam}`, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForSelector('#ddsubfundcode', { timeout: 15000 });
    // #rdoNONNFO is checked by default (confirmed live), but select it
    // explicitly rather than relying on that default holding for every AMC.
    await evalClick(page, '#rdoNONNFO');
    await sleep(500);

    let schemes = await listRegularGrowthSchemes(page);
    if (nameFilter) schemes = schemes.filter((s) => nameFilter.test(s.text));
    if (limit) schemes = schemes.slice(0, limit);
    console.log(`[cams:${amcKey}] ${schemes.length} scheme(s) to process.`);

    for (const scheme of schemes) {
      // Reuse check BEFORE touching the scheme dropdown at all: the
      // orchestrator (scripts/sync_invest_links.js's fetchHdfcViaCams) also
      // stores a share-class-stripped base-name key alongside the full
      // plan-qualified one, so a scheme already covered by a previous run
      // never has to go through the flaky select-scheme -> wait-for-
      // postback step just to re-derive a name we already know.
      const schemeKey = scheme.text.trim().toLowerCase().replace(/\s+/g, ' ');
      if (existingBySchemeName?.[schemeKey]) {
        if (process.env.CAMS_DEBUG) console.log(`  [debug] reuse hit: ${scheme.text}`);
        bySchemeName[schemeKey] = existingBySchemeName[schemeKey];
        continue;
      }
      if (process.env.CAMS_DEBUG) console.log(`  [debug] processing: ${scheme.text}`);

      // CAMS's postback timing is genuinely inconsistent under automation
      // (confirmed live: the same scheme succeeds on one run and times out
      // on the next with no code change) -- retry the whole per-scheme
      // attempt a couple of times before giving up on it for this run.
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          await selectOption(page, 'ddsubfundcode', scheme.value, 'ddlschemetype');
          const planOptions = await waitForPlanOptions(page);
          const regularGrowth = findRegularGrowthOption(planOptions);
          if (!regularGrowth) {
            console.log(`[cams:${amcKey}] ${scheme.text}: no Regular-Growth plan option, skipping.`);
            break;
          }

          const normName = regularGrowth.text.trim().toLowerCase().replace(/\s+/g, ' ');
          if (existingBySchemeName?.[normName]) {
            // This used to be a silent branch -- see selectOption()'s
            // comment for why that made a real bug invisible. Now logged
            // so a genuine (post-fix) cache hit here is distinguishable
            // from one that never happens again.
            if (process.env.CAMS_DEBUG) console.log(`  [debug] reuse hit via plan name: ${regularGrowth.text}`);
            bySchemeName[normName] = existingBySchemeName[normName];
            break;
          }

          await selectOption(page, 'ddlschemetype', regularGrowth.value);
          await sleep(500);

          await fillBrokerDetails(page);
          const link = await clickGenerateAndReadLink(page);
          if (link) {
            bySchemeName[normName] = link;
            console.log(`[cams:${amcKey}] created link for ${regularGrowth.text}`);
          }
          break;
        } catch (e) {
          if (attempt === MAX_ATTEMPTS) {
            console.warn(`[cams:${amcKey}] ${scheme.text}: ${e.message} (gave up after ${MAX_ATTEMPTS} attempts)`);
          } else {
            console.warn(`[cams:${amcKey}] ${scheme.text}: ${e.message} (retrying, attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
            await sleep(1000);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  return { bySchemeName };
}

module.exports = { CAMS_AMCS, fetchCamsLinksForAmc, PLAN_OPTION_PATTERN, findRegularGrowthOption };
