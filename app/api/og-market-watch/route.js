import { ImageResponse } from '@vercel/og';
import { OG_LOGO_FULL_URL } from '@/lib/ogAssets';

export const runtime = 'edge';

async function getLiveData() {
  try {
    const r = await fetch('https://mfcalc.getabundance.in/api/market-watch', {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const n50 = d.indices?.find(i => i.id === 'NIFTY 50');
    const bank = d.indices?.find(i => i.id === 'NIFTY BANK');
    return { n50, bank, isOpen: d.isOpen, marketStatus: d.marketStatus, timestamp: d.cached_at };
  } catch { return null; }
}

export async function GET() {
  const live = await getLiveData();
  const n50  = live?.n50;
  const bank = live?.bank;
  const isOpen = live?.isOpen ?? false;
  const n50Last = n50 ? n50.last.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
  const n50Pct  = n50 ? ((n50.pct >= 0 ? '+' : '') + n50.pct.toFixed(2) + '%') : '—';
  const bankLast = bank ? bank.last.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
  const bankPct  = bank ? ((bank.pct >= 0 ? '+' : '') + bank.pct.toFixed(2) + '%') : '—';
  const n50Color = n50?.pct >= 0 ? '#66bb6a' : '#ef5350';
  const bankColor = bank?.pct >= 0 ? '#66bb6a' : '#ef5350';

  return new ImageResponse(
    (
      <div style={{
        background: 'linear-gradient(135deg, #071507 0%, #0d2b0d 60%, #122b14 100%)',
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '52px 70px',
        fontFamily: 'sans-serif',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px',
          background: 'linear-gradient(90deg, #1b5e20, #43a047, #a5d6a7, #43a047, #1b5e20)',
          display: 'flex' }} />
        {/* Glow */}
        <div style={{ position: 'absolute', top: -80, right: -40, width: 380, height: 380,
          borderRadius: '50%', background: 'rgba(67,160,71,.05)', display: 'flex' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
            background: isOpen ? 'rgba(67,160,71,.15)' : 'rgba(255,255,255,.06)',
            border: `1.5px solid ${isOpen ? 'rgba(67,160,71,.4)' : 'rgba(255,255,255,.12)'}`,
            borderRadius: 30, padding: '8px 20px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%',
              background: isOpen ? '#69f0ae' : '#757575', display: 'flex' }} />
            <div style={{ color: isOpen ? '#a5d6a7' : 'rgba(255,255,255,.5)',
              fontSize: 14, fontWeight: 700, letterSpacing: '1px', display: 'flex' }}>
              NSE INDIA · {isOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </div>
          </div>
          <div style={{ display: 'flex', color: 'rgba(255,255,255,.4)', fontSize: 13,
            fontWeight: 600, fontFamily: 'monospace' }}>ARN-251838</div>
        </div>

        {/* Main */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ color: '#81c784', fontSize: 16, fontWeight: 700,
            letterSpacing: '2px', display: 'flex' }}>LIVE MARKET DATA · NSE INDIA</div>
          <div style={{ fontSize: 72, fontWeight: 900, color: '#fff',
            letterSpacing: '-3px', lineHeight: 1, display: 'flex' }}>
            Live Market Watch
          </div>
          {/* Live index tiles */}
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            {[
              { label: 'Nifty 50', val: n50Last, pct: n50Pct, color: n50Color },
              { label: 'Bank Nifty', val: bankLast, pct: bankPct, color: bankColor },
            ].map(t => (
              <div key={t.label} style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 12, padding: '12px 20px',
              }}>
                <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, fontWeight: 700,
                  letterSpacing: '0.5px', display: 'flex' }}>{t.label}</div>
                <div style={{ color: '#fff', fontSize: 26, fontWeight: 900,
                  fontFamily: 'monospace', letterSpacing: '-0.5px', display: 'flex' }}>{t.val}</div>
                <div style={{ color: t.color, fontSize: 16, fontWeight: 700,
                  fontFamily: 'monospace', display: 'flex' }}>{t.pct}</div>
              </div>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
              {['FII/DII Flows', 'Top Gainers & Losers', 'OHLC Range'].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#43a047', display: 'flex' }} />
                  <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 15, fontWeight: 600,
                    display: 'flex' }}>{f}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <img src={OG_LOGO_FULL_URL} style={{ height: 72, objectFit: 'contain', objectPosition: 'left', marginBottom: 4 }} />
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, display: 'flex' }}>Abundance Financial Services</div>
            <div style={{ color: '#81c784', fontSize: 13, display: 'flex' }}>AMFI Registered Distributor · ARN-251838</div>
          </div>
          <div style={{ color: 'rgba(255,255,255,.2)', fontSize: 13,
            fontFamily: 'monospace', fontWeight: 600, display: 'flex' }}>
            mfcalc.getabundance.in/market-watch
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
