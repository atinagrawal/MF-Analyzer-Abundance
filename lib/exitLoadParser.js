/**
 * lib/exitLoadParser.js
 *
 * Deterministic text parser to convert raw Indian Mutual Fund exit load strings
 * into structured numerical tiers ({ days, rate }) and free percentage allowances ({ freePercent }).
 *
 * Returns { confidence: 'high' | 'low', freePercent: number, tiers: Array<{days, rate}> | null }
 * If the clause cannot be parsed with 100% confidence, returns confidence: 'low', tiers: null
 * so downstream financial calculators fall back to raw text display without computing wrong numbers.
 */

function parseDays(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();

  // "1 year" / "2 years" / "3 years" / "12 months"
  if (/(\d+)\s*year/i.test(s)) {
    const m = s.match(/(\d+)\s*year/i);
    return parseInt(m[1], 10) * 365;
  }
  if (/(\d+)\s*month/i.test(s)) {
    const m = s.match(/(\d+)\s*month/i);
    return parseInt(m[1], 10) * 30;
  }
  if (/(\d+)\s*day/i.test(s)) {
    const m = s.match(/(\d+)\s*day/i);
    return parseInt(m[1], 10);
  }
  return null;
}

function parseExitLoadText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { confidence: 'low', freePercent: 0, tiers: null };
  }

  const text = rawText.trim();

  // 1. Nil / Zero Exit Load cases
  if (/^(NIL|N\.A\.|NONE|NO EXIT LOAD|0%?)$/i.test(text) || /EXIT LOAD IS NIL/i.test(text) || /^NIL\.?$/i.test(text)) {
    return { confidence: 'high', freePercent: 0, tiers: [] };
  }

  // Check for free percentage allowance clause (e.g. "For units in excess of 10%...", "units above 10%...")
  let freePercent = 0;
  const freeMatch = text.match(/(?:excess|above|over|exceeding)\s+of\s+(\d+(?:\.\d+)?)\s*%/i) ||
                    text.match(/(\d+(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?(?:investment|units)\s+is\s+free/i) ||
                    text.match(/units\s+up\s+to\s+(\d+(?:\.\d+)?)\s*%\s+.*free/i) ||
                    text.match(/(?:for\s+)?units\s+(?:above|in excess of)\s+(\d+(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?investment/i);
  if (freeMatch) {
    freePercent = parseFloat(freeMatch[1]);
  }

  // Clean text for rate/tier parsing by stripping the free percentage preamble if present
  let cleanText = text;
  if (freePercent > 0) {
    cleanText = text.replace(/(?:for\s+)?units\s+(?:above|in excess of|over)\s+\d+(?:\.\d+)?\s*%\s+of\s+(?:the\s+)?investment,?\s*/i, '');
  }

  // 2. Liquid Fund 7-day Tiered Exit Load pattern
  // e.g. "0.0070% if redeemed within 1 day, 0.0065% if redeemed within 2 days..."
  if (/0\.00\d+%/i.test(cleanText) && /1 day/i.test(cleanText) && /6 days/i.test(cleanText)) {
    const liquidTiers = [
      { days: 1, rate: 0.00007 },
      { days: 2, rate: 0.000065 },
      { days: 3, rate: 0.00006 },
      { days: 4, rate: 0.000055 },
      { days: 5, rate: 0.00005 },
      { days: 6, rate: 0.000045 },
    ];
    return { confidence: 'high', freePercent: 0, tiers: liquidTiers };
  }

  // 3. Multi-clause parsing by splitting across 'and' / ',' / ';'
  // "and" requires surrounding whitespace (word boundary, avoids splitting
  // mid-word); comma/semicolon splitting does NOT require a preceding
  // space, since real clauses often read "...within 12 months, 1.5% if..."
  // with no space before the comma -- requiring one here previously merged
  // two tiers into a single chunk and silently dropped the earlier of the
  // two (confirmed against a real 3-tier SBI Credit Risk Fund clause).
  const chunks = cleanText.split(/\s+and\s+|\s*[,;]\s*/i);
  if (chunks.length >= 2) {
    const tiers = [];
    let validCount = 0;

    for (const chunk of chunks) {
      // Find exit load rate (e.g. "exit load of 2%", "1%", "0.25%", "0.10%")
      const rateMatch = chunk.match(/(?:exit\s+load\s+of\s+)?(\d+(?:\.\d+)?)\s*%/i);
      // Find day limit (prefer "on or before X days/years" or "within X days/years")
      const dayMatch = chunk.match(/(?:within|on or before|before|less than|up to)\s*(\d+\s*(?:days?|months?|years?))/i) ||
                       chunk.match(/(\d+\s*(?:days?|months?|years?))\s*$/i);

      if (rateMatch && dayMatch) {
        const rate = parseFloat(rateMatch[1]) / 100;
        const days = parseDays(dayMatch[1]);
        if (rate != null && !isNaN(rate) && days != null && !isNaN(days)) {
          tiers.push({ days, rate });
          validCount++;
        }
      }
    }

    if (validCount >= 2 && tiers.length >= 2) {
      // Remove duplicate day boundaries, sort by days ascending
      const uniqueMap = new Map();
      for (const t of tiers) {
        uniqueMap.set(t.days, t.rate);
      }
      const sortedTiers = Array.from(uniqueMap.entries())
        .map(([days, rate]) => ({ days, rate }))
        .sort((a, b) => a.days - b.days);

      return { confidence: 'high', freePercent, tiers: sortedTiers };
    }
  }

  // 4. Single-tier standard pattern: "Exit load of 1% if redeemed within 1 year", "0.50% if redeemed within 15 days"
  const singleRegex = /(?:exit\s+load\s+of\s+)?(\d+(?:\.\d+)?)\s*%\s+(?:if|for)?\s*(?:redeemed|switched)?\s*(?:within|on or before|less than|prior to|up to|before)\s*(\d+\s*(?:days?|months?|years?))/i;
  const singleMatch = cleanText.match(singleRegex);

  if (singleMatch) {
    const rate = parseFloat(singleMatch[1]) / 100;
    const days = parseDays(singleMatch[2]);
    if (rate != null && !isNaN(rate) && days != null && !isNaN(days)) {
      return { confidence: 'high', freePercent, tiers: [{ days, rate }] };
    }
  }

  // 5. Unrecognized or complex custom clause -> low confidence fallback
  return { confidence: 'low', freePercent: 0, tiers: null };
}

module.exports = {
  parseExitLoadText,
  parseDays
};
