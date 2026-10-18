# CAMS distributor invest-link generator — feasibility notes (2026-10-18)

## Why this exists

Following up on the Carnelian MF direct-invest-link work (`lib/nfoInvestLinks.js`,
`scripts/carnelian-invest-link.mjs`, `scripts/sync_invest_links.js`): the user asked
whether any other AMC provides a similar self-service "direct invest" link for MFDs.
This documents what was found and verified live.

**Update (same day):** now automated -- `scripts/lib/camsLinkGenerator.js`
(Puppeteer) + a `hdfc` provider in `scripts/sync_invest_links.js`, scheduled
daily in `.github/workflows/invest-links-sync.yml`. See "Automating it:
what it took" below for what the earlier "not yet automated" section
originally got wrong before it worked.

## What's out there (surveyed, not exhaustive)

- **Carnelian MF** — bespoke public Laravel+Inertia portal
  (`partners.carnelianmf.com`), no login beyond ARN validation, clean JSON API.
  Already built (see files above).
- **CAMS** (`mycams.camsonline.com`) — a **shared, white-labelled tool** used by
  (at least) HDFC MF: `camsapp/Admin/AMCLinkGenerate.aspx?amc=<amc-id>`. Public
  (ARN + EUIN only, no distributor login), but classic ASP.NET WebForms with
  AJAX UpdatePanel postbacks (`__VIEWSTATE`, `ScriptManager1` partial-postback
  protocol, a broker-search modal with a server-rendered results grid). CAMS is
  RTA for a large share of the industry, so other CAMS-serviced AMCs likely
  reuse this exact tool with a different `amc=` id — **not yet confirmed for
  any AMC besides HDFC**.
- **KFinTech** ("KFinKart Distributor Portal") — appears to be a full
  login-gated dashboard (username/password), not an anonymous ARN-only form.
  Out of scope: would require handling real distributor credentials.
- **Bajaj Finserv AMC, SBI MF** — WhatsApp-bot based ("Hi" to a business
  number, TPIN/OTP login, conversational transaction flow). A fundamentally
  different integration (WhatsApp Business API), not a web form. Out of scope
  for now.
- **Invesco MF** — markets an ARN-mapped "Transact Online URL"; page used to
  confirm the self-service flow 404'd when checked, not verified further.

## Verified live: HDFC MF via CAMS

Walked through `mycams.camsonline.com/camsapp/Admin/AMCLinkGenerate.aspx?amc=LLU2rKXO6MxsgDl5CC1fAg%3D%3D`
in a real browser for HDFC's open NFO (HDFC Nifty LargeMidcap250 Plus 8-13 Yr
G-Sec 70:30 Index Fund) and produced a real, working investor link:
`https://s.camsai.com/r/O4Dik8r5` — confirmed it resolves to a real
myCAMS investor transaction page (prompts for PAN), correctly ARN/sub-broker
tagged. Now in `lib/nfoInvestLinks.js`.

**Flow** (all through one ASP.NET UpdatePanel-driven page, scheme scoped to
Regular/Growth per this feature's existing scope rule):
1. Select **Select Option → NFO** (radio).
2. **Scheme name** dropdown → pick the fund.
3. **Scheme Plan & Option** dropdown → pick the "... Regular Growth" entry.
4. Click the search icon next to **ARN** → opens a "Search By" modal (ARN or
   Name radio + text box + SUBMIT). Searching is a **substring match across
   all CAMS-registered broker codes**, not an exact lookup -- e.g. searching
   `0155` returns every ARN containing those digits (ARN-10155, ARN-90155,
   ARN-301555, ...), not just ARN-0155. The results render as a scrollable
   grid (Broker Code / Broker Name / EUIN columns); click the exact
   `ARN-<code>` link in the first column to select it and close the modal.
5. Fill **Sub Broker Code** (NJ IndiaInvest's own internal partner code,
   distinct from the Sub Broker ARN -- this form has both fields, Carnelian's
   did not), **Sub Broker ARN**, **EUIN**.
6. Click **Generate** → page renders a **Short URL** (`s.camsai.com/r/...`)
   and a **Long URL** (`mycams.camsonline.com/camsapp/myCAMSInvestment.aspx?...`,
   a long opaque token) below the form, no page reload.

Distributor identifiers used (same as Carnelian's, all already in chat/
screenshots the user shared, not secrets): ARN-0155 (NJ IndiaInvest Pvt Ltd),
sub-broker code 22734, sub-broker ARN-251838, EUIN E468841.

## Why this isn't scripted yet (unlike Carnelian)

Carnelian's portal is a clean JSON API reachable with plain `fetch` -- see
`scripts/carnelian-invest-link.mjs`'s header for why that was straightforward.
CAMS's tool is materially harder to script without a browser:

- It's ASP.NET WebForms + `UpdatePanel` **async postbacks**, not a REST API.
  Each interaction (opening the search modal, submitting the ARN search,
  selecting a scheme type) is a partial postback requiring the *current*
  `__VIEWSTATE`/`__VIEWSTATEGENERATOR`/`__EVENTVALIDATION` plus a
  `ScriptManager1=<UpdatePanelID>|<triggeringControlID>` field, and returns a
  pipe-delimited delta format (not plain HTML) that has to be parsed to
  extract the next step's updated hidden fields.
- The ARN search is a **substring match returning a multi-row grid** to pick
  from, not a single validated lookup like Carnelian's "Check" button --
  automating it means either searching precisely enough to get one exact hit,
  or parsing the grid for an exact `ARN-<code>` match.
- This repo's own scripts (`sync_pms_factsheets.js`, `sync_amfi_nfo.js`,
  `carnelian-invest-link.mjs`) deliberately avoid heavy dependencies --
  there's no Puppeteer/Playwright in this project yet. Reverse-engineering the
  raw postback wire format keeps that pattern but costs real iteration time
  against CAMS's live production system (shared infrastructure real
  distributors depend on -- not something to probe aggressively). A
  browser-automation-based sync (Puppeteer/Playwright, installable fine in a
  GitHub Actions runner) would mirror the verified manual flow exactly and be
  far more robust to CAMS changing internal implementation details, at the
  cost of adding that dependency and a heavier CI job than this repo's other
  syncs.

## Scope: not NFO-only

The user's intent for this whole invest-link effort is **every fund we list,
not just open NFOs** -- NFOs just happened to be where it started (Carnelian's
live NFO) and where today's live CAMS test happened to point (HDFC's one
currently-open NFO, tested with the form's "NFO" radio for convenience). The
architecture already matches that intent and needs no redesign:

- `scripts/sync_invest_links.js`'s `fetchCarnelianLinks()` already pulls
  **every** Regular-Growth scheme visible on Carnelian's own portal (byIsin +
  bySchemeName), NFO or not -- it happens to be 1 fund today only because
  Carnelian only has 1 fund.
- `lib/investLinksCache.js` already resolves by **ISIN** for the MF screener
  (any fund with a live ISIN, from `lib/screenerData.js`) and by **scheme
  name** for NFOs specifically (the one case where AMFI's feed has no ISIN
  yet) -- these are two lookup paths for the same underlying link store, not
  two separate systems.

So when a `cams` provider gets built, it should enumerate an AMC's **entire**
scheme list (CAMS's own form exposes this via the "NFO" / "Non-NFO" radio --
"Non-NFO" lists every regular, already-trading scheme), not just whatever's
currently an open NFO, exactly mirroring how the Carnelian provider already
behaves. A fund generated this way surfaces automatically on the MF screener
once wired in -- no code change needed there, `lib/screenerData.js` already
attaches `investLink` to every row by ISIN.

## Automating it: what it took

Went with Puppeteer, not raw-postback-scripting -- confirmed live, selecting
a scheme resets the ARN/EUIN/sub-broker fields, so each scheme genuinely
needs its own full "search ARN -> fill broker details -> Generate" round
trip in that order; replaying real page interactions was far more tractable
than reverse-engineering the ASP.NET UpdatePanel wire format for that.
`scripts/lib/camsLinkGenerator.js` is the result; `scripts/sync_invest_links.js`'s
`fetchHdfcViaCams()` wraps it and resolves each result's ISIN against
`mf_screener` afterward (CAMS never exposes ISIN anywhere -- the scheme
`<select>`'s own values are internal CAMS codes like `ZEQU`).

Three non-obvious things broke the first pass, all confirmed by direct
inspection rather than guessed:
- **Custom-styled radio inputs aren't Puppeteer-clickable.** `page.click()`
  threw "Node is either not clickable" on `#rdoNONNFO`/`#rbbrok` -- this
  page hides them behind their `<label>`. Fixed by calling `.click()`
  programmatically via `page.evaluate` instead (bypasses Puppeteer's
  visibility check, which is fine for a genuinely interactive control that's
  just styled unconventionally).
- **A disabled field's value is never submitted.** The broker-search-by-Name
  flow's `#txtbrok` starts `disabled`; a synthetic `.click()` on `#rbbrok`
  fired its `onclick` but didn't reliably run the page's own
  `brkcheckedChanged()` (the function that un-disables it) through that
  path -- so the typed search name was silently dropped from the postback,
  and the search returned nothing. Fixed by calling `brkcheckedChanged()`
  directly after setting `.checked = true`.
- **Postback timing is genuinely inconsistent, not flaky in a fixable way.**
  Fixed `sleep()`s after each postback were the real source of intermittent
  failures, not the click/fill steps themselves -- replaced with
  `page.waitForFunction` polling for the actual expected DOM state (grid
  populated, ARN field containing the selected code, etc.), plus a 3-attempt
  retry per scheme. Even with that, CAMS's response time under automation
  varies enough that a single sync run won't always succeed on every scheme
  the first time -- the per-scheme reuse check (by base scheme name, checked
  *before* touching the scheme dropdown at all) means a scheme that fails
  this run just gets picked up on the next one, without re-doing any
  already-succeeded work.

Verified live end-to-end multiple times, including a real production R2
write and the MF screener actually showing the "Invest" badge + drawer CTA
for HDFC Short Term Fund (ISIN INF179K01CU6) -- not just a generated link,
the whole pipeline through to the UI.

## Extending to other CAMS AMCs

Same tool, different `?amc=<id>` page per fund house -- add an entry to
`scripts/lib/camsLinkGenerator.js`'s `CAMS_AMCS` map and a matching
`fetch...ViaCams` provider in `scripts/sync_invest_links.js` (near-identical
to `fetchHdfcViaCams()`, just a different `amcLikePattern` for the
`mf_screener` ISIN lookup). `amc=` ids aren't yet confirmed for any other
AMC -- worth checking Axis, ICICI Prudential, Kotak Mahindra, Motilal
Oswal, quant, SBI, Zerodha, and Jio BlackRock (all have open NFOs as of
this writing), since RTA isn't publicly obvious per AMC without checking
each one's own distributor page the way HDFC's was found.
