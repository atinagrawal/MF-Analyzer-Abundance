/**
 * scripts/pms_factsheet_manual_fill.js
 *
 * Fallback path for scripts/sync_pms_factsheets.js's Gemini extraction when
 * the in-script GEMINI_API_KEY has hit its free-tier daily quota (a
 * DailyQuotaExhaustedError in that script -- this happened repeatedly
 * during development, several times a week). Rather than the old pattern
 * of writing a one-off manual_extract_fill_tmp.js script and deleting it
 * after each use, this is a permanent, documented tool: it prints exactly
 * what a local extraction needs to produce, and safely writes a completed
 * extraction back into R2 through the SAME validation + backup path the
 * real sync uses, so a manually-run extraction (by a local Gemini CLI/
 * agent, or by a person reading the factsheet directly) is exactly as
 * safe as an automated one.
 *
 * ── Usage ───────────────────────────────────────────────────────────────
 *
 * 1. List every factsheet document that still has no `.extracted` data
 *    (or pass --stale to also include documents whose URL changed since
 *    their last extraction -- same staleness rule the real sync uses):
 *
 *      node scripts/pms_factsheet_manual_fill.js --list [--stale]
 *
 * 2. For one specific document, print the exact prompt + PDF URL a local
 *    Gemini CLI/agent (or a person) should use. This is the SAME prompt
 *    text EXTRACTION_SCHEMA_PROMPT/buildMultiStrategySchemaPrompt sends
 *    to the API, so a local run produces an identically-shaped result:
 *
 *      node scripts/pms_factsheet_manual_fill.js --prompt <providerKey> "<strategyName>"
 *
 *    Multi-strategy providers (Sundaram today) -- pass just the provider
 *    key and no strategy name to get the combined prompt + full strategy
 *    name list:
 *
 *      node scripts/pms_factsheet_manual_fill.js --prompt sundaram
 *
 * 3. Once a completed JSON result (matching the printed schema) is saved
 *    to a local file, validate + write it into R2:
 *
 *      node scripts/pms_factsheet_manual_fill.js --fill <providerKey> "<strategyName>" <path-to-result.json>
 *
 *    This runs the result through the exact same validateAndCleanExtraction()
 *    the automated sync uses (so a bad/hallucinated field is dropped, not
 *    silently trusted), backs up the current provider doc to
 *    `pms-factsheets.json.backup` before writing (scripts/lib/r2SyncSafety.js),
 *    and updates only the matching strategy's `.extracted` field --
 *    everything else in R2 is left untouched.
 *
 * Provider keys and their exact strategyName values come from PROVIDERS
 * in scripts/sync_pms_factsheets.js (`--list` prints both).
 */

const path = require('path');
const fs = require('fs');
const {
  PROVIDERS,
  validateAndCleanExtraction,
} = require('./sync_pms_factsheets.js');

// Mirrors the two prompt-builder functions in sync_pms_factsheets.js
// exactly (single-strategy is copy-pasted rather than re-exported, since
// re-exporting a `const` built at module load time is no simpler than
// duplicating the string here -- both need to change together if the
// schema ever changes, same as the self-test already has to).
function requireSyncModuleSource() {
  return fs.readFileSync(path.join(__dirname, 'sync_pms_factsheets.js'), 'utf8');
}

// Reads EXTRACTION_SCHEMA_PROMPT and buildMultiStrategySchemaPrompt's
// template straight out of sync_pms_factsheets.js's own source rather
// than hardcoding a second copy here that could silently drift out of
// sync with the real prompt the automated path sends to Gemini.
function extractPromptSource(constName) {
  const src = requireSyncModuleSource();
  const startMarker = `const ${constName} = \``;
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`Could not find ${constName} in sync_pms_factsheets.js`);
  const bodyStart = start + startMarker.length;
  const end = src.indexOf('`;', bodyStart);
  return src.slice(bodyStart, end);
}

function multiStrategyPromptFor(strategyNames) {
  const src = requireSyncModuleSource();
  const fnStart = src.indexOf('function buildMultiStrategySchemaPrompt');
  const bodyStart = src.indexOf('return `', fnStart) + 'return `'.length;
  const bodyEnd = src.indexOf('`;', bodyStart);
  const template = src.slice(bodyStart, bodyEnd);
  const nameList = strategyNames.map((n) => `"${n}"`).join(', ');
  return template.replace(/\$\{nameList\}/g, nameList);
}

async function loadR2() {
  return import('../lib/r2.js');
}

async function loadR2Safety() {
  return require('./lib/r2SyncSafety.js');
}

function isStale(doc, prev) {
  if (!doc.extracted) return true;
  if (!prev) return false;
  return prev.url !== doc.url; // same staleness rule enrichWithExtraction() uses
}

async function cmdList(includeStale) {
  const { r2Get } = await loadR2();
  const data = await r2Get('pms-factsheets.json');
  if (!data) {
    console.log('No pms-factsheets.json in R2 yet.');
    return;
  }
  console.log('Provider key      | Strategy                          | Period            | Status      | URL');
  console.log('-'.repeat(120));
  for (const [key, provider] of Object.entries(data.providers || {})) {
    for (const doc of provider.documents || []) {
      if (doc.docType !== 'factsheet') continue;
      const missing = !doc.extracted;
      if (!includeStale && !missing) continue;
      const status = missing ? 'MISSING' : 'has data';
      console.log(
        `${key.padEnd(18)} | ${doc.strategyName.padEnd(34)} | ${(doc.period || '—').padEnd(17)} | ${status.padEnd(11)} | ${doc.url || '(no url -- pending, nothing to extract)'}`
      );
    }
  }
}

function findProvider(providerKey) {
  const provider = PROVIDERS.find((p) => p.key === providerKey);
  if (!provider) {
    const keys = PROVIDERS.map((p) => p.key).join(', ');
    throw new Error(`Unknown provider key "${providerKey}". Known keys: ${keys}`);
  }
  return provider;
}

async function findDoc(providerKey, strategyName) {
  const { r2Get } = await loadR2();
  const data = await r2Get('pms-factsheets.json');
  const provider = data?.providers?.[providerKey];
  if (!provider) throw new Error(`No R2 data yet for provider "${providerKey}" -- run the real sync at least once first.`);
  const doc = (provider.documents || []).find((d) => d.docType === 'factsheet' && d.strategyName === strategyName);
  if (!doc) {
    const names = (provider.documents || []).filter((d) => d.docType === 'factsheet').map((d) => d.strategyName).join(', ');
    throw new Error(`No factsheet document for strategy "${strategyName}" under provider "${providerKey}". Known strategy names: ${names}`);
  }
  return { data, provider, doc };
}

async function cmdPrompt(providerKey, strategyName) {
  const provider = findProvider(providerKey);
  const { doc, provider: r2Provider } = strategyName
    ? await findDoc(providerKey, strategyName)
    : { doc: null, provider: null };

  const allStrategyNames = (r2Provider?.documents || [])
    .filter((d) => d.docType === 'factsheet')
    .map((d) => d.strategyName);

  // Multiple strategies share one PDF (same url appears more than once)
  // -- same grouping logic enrichWithExtraction() uses -- so a strategy
  // name with no arg, or belonging to such a group, gets the combined
  // multi-strategy prompt instead of the single-strategy one.
  const isMultiDoc = !strategyName || (doc && allStrategyNames.filter((n) => n).length > 1 &&
    (r2Provider.documents || []).filter((d) => d.docType === 'factsheet' && d.url === doc.url).length > 1);

  if (!strategyName) {
    console.log(`Provider: ${provider.displayName} (${provider.key})`);
    console.log(`Strategies covered by this provider's factsheet(s): ${allStrategyNames.join(', ')}`);
    console.log('\nIf these strategies share ONE combined PDF, use the multi-strategy prompt below against that one URL.');
    console.log('If each has its own PDF, re-run with a specific strategy name to get its single-strategy prompt + URL.\n');
    console.log('── PROMPT (multi-strategy) ──────────────────────────────────────────');
    console.log(multiStrategyPromptFor(allStrategyNames));
    return;
  }

  console.log(`Provider: ${provider.displayName} (${provider.key})`);
  console.log(`Strategy: ${strategyName}`);
  console.log(`PDF URL:  ${doc.url || '(no url -- this is a pending/unpublished factsheet, nothing to fetch yet)'}`);
  console.log(`Period:   ${doc.period || '(unknown)'}`);
  console.log();
  if (isMultiDoc) {
    const groupNames = (r2Provider.documents || [])
      .filter((d) => d.docType === 'factsheet' && d.url === doc.url)
      .map((d) => d.strategyName);
    console.log(`This PDF also covers: ${groupNames.filter((n) => n !== strategyName).join(', ') || '(no other strategies)'}`);
    console.log('── PROMPT (multi-strategy -- extract the "strategies" array, then use just the entry matching this strategyName) ──');
    console.log(multiStrategyPromptFor(groupNames));
  } else {
    console.log('── PROMPT (single-strategy) ─────────────────────────────────────────');
    console.log(extractPromptSource('EXTRACTION_SCHEMA_PROMPT'));
  }
  console.log('\nFeed the PDF at the URL above + this prompt to a local Gemini CLI/agent (or read it yourself), save the');
  console.log('resulting JSON to a file, then run:');
  console.log(`  node scripts/pms_factsheet_manual_fill.js --fill ${providerKey} "${strategyName}" <path-to-result.json>`);
}

async function cmdFill(providerKey, strategyName, jsonPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  // A multi-strategy result (has a top-level "strategies" array) -- pull
  // out just the entry for this strategyName, same shape a single-strategy
  // result already has.
  const target = Array.isArray(raw.strategies)
    ? raw.strategies.find((s) => s.strategyName === strategyName)
    : raw;
  if (!target) {
    throw new Error(`No entry for strategyName "${strategyName}" found in ${jsonPath} (checked top level and .strategies[]).`);
  }

  const cleaned = validateAndCleanExtraction(target);
  if (!cleaned) {
    throw new Error('validateAndCleanExtraction() rejected this result -- nothing usable survived validation. Check the JSON against the printed schema (run --prompt again) and try again.');
  }

  const { data, provider } = await findDoc(providerKey, strategyName);
  // Deep-clone before mutating -- the exact bug this session hit once
  // already: passing the same object reference as both the R2 backup
  // value and the value being mutated silently makes the backup useless.
  const existingProvider = JSON.parse(JSON.stringify(provider));

  const docIndex = provider.documents.findIndex((d) => d.docType === 'factsheet' && d.strategyName === strategyName);
  provider.documents[docIndex] = {
    ...provider.documents[docIndex],
    extracted: { ...cleaned, extractedAt: new Date().toISOString() },
  };

  const { r2Put } = await loadR2();
  const { backupThenPut } = await loadR2Safety();
  // Backup value: the FULL previous document (deep-cloned provider swapped
  // back in) so `.backup` is a genuine rollback point. New content: the
  // FULL document with only this one provider's documents array mutated --
  // backupThenPut stringifies `existingValue` itself but expects
  // `newContent` already stringified (same convention sync_pms_factsheets.js's
  // own call site uses).
  await backupThenPut(
    r2Put,
    'pms-factsheets.json',
    { ...data, providers: { ...data.providers, [providerKey]: existingProvider } },
    JSON.stringify({ ...data, providers: { ...data.providers, [providerKey]: provider } })
  );

  console.log(`✅ Wrote extracted data for ${providerKey} / "${strategyName}" to R2 (pms-factsheets.json), with a pre-write backup at pms-factsheets.json.backup.`);
  console.log('Fields captured:', Object.keys(cleaned).filter((k) => cleaned[k] != null).join(', '));
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  try {
    if (cmd === '--list') {
      await cmdList(rest.includes('--stale'));
    } else if (cmd === '--prompt') {
      const [providerKey, strategyName] = rest;
      if (!providerKey) throw new Error('Usage: --prompt <providerKey> ["<strategyName>"]');
      await cmdPrompt(providerKey, strategyName);
    } else if (cmd === '--fill') {
      const [providerKey, strategyName, jsonPath] = rest;
      if (!providerKey || !strategyName || !jsonPath) throw new Error('Usage: --fill <providerKey> "<strategyName>" <path-to-result.json>');
      await cmdFill(providerKey, strategyName, jsonPath);
    } else {
      console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 45).join('\n'));
      process.exit(cmd ? 1 : 0);
    }
  } catch (e) {
    console.error('[PMS Factsheet Manual Fill] Error:', e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { cmdList, cmdPrompt, cmdFill, isStale };
