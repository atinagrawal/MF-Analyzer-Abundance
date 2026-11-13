// lib/nseMcp.js — thin client for NSE's official MCP (Model Context Protocol)
// server (see https://www.nseindia.com/nse-mcp). It's a free, unauthenticated
// Streamable-HTTP endpoint publishing NSE's own bhavcopy/index files — used
// here only to enrich /indices with a real trailing-window P/E percentile,
// alongside (not replacing) the static PE_THRESHOLDS gauge already there.
// Every export degrades to null on any failure: this endpoint carries no
// uptime guarantee and the page must render fine without it.

const BHAVCOPY_MCP_URL = 'https://mcp.nseindia.in/bhavcopy/cm/mcp';
const MCP_PROTOCOL_VERSION = '2025-06-18';
const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — EOD data, matches indicesData.js's own cache window

const _cache = new Map(); // `${tool}::${JSON.stringify(args)}` -> { value, ts }

function parseMcpResponse(text) {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith('{')
    ? trimmed
    : trimmed.split('\n').filter((l) => l.startsWith('data:')).pop()?.slice(5).trim();
  if (!jsonText) throw new Error(`Unrecognized NSE MCP response: ${trimmed.slice(0, 200)}`);
  return JSON.parse(jsonText);
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callNseMcpTool(toolName, args, { url = BHAVCOPY_MCP_URL } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

  const initRes = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'mf-analyzer-abundance', version: '1.0.0' },
      },
    }),
  });
  if (!initRes.ok) throw new Error(`NSE MCP initialize failed: HTTP ${initRes.status}`);
  const sessionId = initRes.headers.get('mcp-session-id');
  await initRes.text().catch(() => {});
  if (!sessionId) throw new Error('NSE MCP initialize returned no session id');

  const callRes = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { ...headers, 'Mcp-Session-Id': sessionId },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: args } }),
  });
  if (!callRes.ok) throw new Error(`NSE MCP tools/call failed: HTTP ${callRes.status}`);

  const payload = parseMcpResponse(await callRes.text());
  if (payload.error) throw new Error(`NSE MCP error: ${JSON.stringify(payload.error)}`);

  const result = payload.result;
  if (result?.isError) throw new Error(`NSE MCP tool error: ${JSON.stringify(result.content)}`);
  const content = result?.content?.[0];
  if (content?.type === 'text') {
    try {
      return JSON.parse(content.text);
    } catch {
      return content.text;
    }
  }
  return result;
}

/**
 * Real trailing-window P/E / P/B / dividend-yield percentile for an NSE
 * index, straight from NSE's own published daily indices file. Returns
 * null for anything the NSE MCP doesn't recognise as an NSE index (e.g.
 * BSE SENSEX, BSE 500) or on any transport/server failure — callers must
 * treat this as an optional enrichment, never a required field.
 */
export async function getIndexValuationPercentile(indexName, months = 24) {
  const cacheKey = `get_index_valuation::${indexName}::${months}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  let value = null;
  try {
    const data = await callNseMcpTool('get_index_valuation', { indexName, months, date: 'today' });
    if (data && !data.error) value = data;
  } catch (err) {
    console.warn(`[nseMcp] get_index_valuation(${indexName}) failed:`, err.message);
  }

  _cache.set(cacheKey, { value, ts: Date.now() });
  return value;
}
