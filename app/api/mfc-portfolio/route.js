/**
 * app/api/mfc-portfolio/route.js
 *
 * Receives an MF Central CAS PDF upload, forwards to the Python parser
 * (api/parse-mfc.py), and returns structured holdings JSON.
 *
 * POST /api/mfc-portfolio
 *   Content-Type: multipart/form-data
 *   Field: file (PDF)
 *
 * Response: { pan, name, period, holdings[], summary }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Resolve Python parser URL — works in Vercel serverless and local dev
function getPythonBase(req) {
  // Explicit override (e.g. PYTHON_PARSER_URL=https://mfcalc.getabundance.in)
  if (process.env.PYTHON_PARSER_URL) return process.env.PYTHON_PARSER_URL;
  // Vercel auto-injects VERCEL_URL = current deployment hostname (no https://)
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // Local dev
  return 'http://localhost:3000';
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return Response.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!file.name?.toLowerCase().endsWith('.pdf')) {
      return Response.json({ error: 'Only PDF files accepted' }, { status: 400 });
    }

    // Forward to Python parser (same infra as existing /api/parse.py)
    const fwd = new FormData();
    fwd.append('file', file);

    const pyRes = await fetch(`${getPythonBase(req)}/api/parse-mfc`, {
      method: 'POST',
      body: fwd,
      signal: AbortSignal.timeout(60_000), // PDF parsing can be slow
    });

    if (!pyRes.ok) {
      const err = await pyRes.json().catch(() => ({ detail: 'Parser error' }));
      return Response.json(
        { error: err.detail || 'PDF parsing failed' },
        { status: pyRes.status }
      );
    }

    const data = await pyRes.json();

    // Compute summary
    const holdings = data.holdings || [];
    const totalValue = holdings.reduce((s, h) => s + (h.value_live || h.value_pdf || 0), 0);
    const totalCost  = holdings.reduce((s, h) => s + (h.value_pdf  || 0), 0);

    // Group by ISIN (multiple folios of the same scheme)
    const byIsin = {};
    for (const h of holdings) {
      if (!byIsin[h.isin]) {
        byIsin[h.isin] = { ...h, units: 0, value_live: 0, folios: [] };
      }
      byIsin[h.isin].units      += h.units;
      byIsin[h.isin].value_live += h.value_live || h.value_pdf;
      byIsin[h.isin].folios.push(h.folio);
    }

    return Response.json({
      pan:      data.pan,
      name:     data.name,
      period:   data.period,
      holdings,                      // raw (one row per folio)
      consolidated: Object.values(byIsin), // merged by ISIN
      summary: {
        total_value:    Math.round(totalValue),
        total_holdings: Object.keys(byIsin).length,
        total_folios:   holdings.length,
        statement_date: data.period?.to || '',
      },
    });

  } catch (err) {
    console.error('[mfc-portfolio]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
