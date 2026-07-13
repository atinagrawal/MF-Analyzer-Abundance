'use client';

import { useState, useEffect } from 'react';

const FUND_TYPES = ['Equity MF', 'Debt MF', 'Hybrid MF', 'Index Fund / ETF', 'SIF', 'Other'];

export default function ManualHoldingsTab() {
  const [users, setUsers]           = useState([]);
  const [selUserId, setSelUserId]   = useState('');
  const [holdings, setHoldings]     = useState([]);
  const [navMap, setNavMap]         = useState({});   // scheme_id/amfi_code → current nav
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState({ type: '', text: '' });
  const [showForm, setShowForm]     = useState(false);
  const [editIdx, setEditIdx]       = useState(null);
  // SIF scheme search
  const [sifSchemes, setSifSchemes] = useState([]);   // all 53 SIF schemes
  const [sifSearch, setSifSearch]   = useState('');   // search query
  const [showSifDrop, setShowSifDrop] = useState(false);

  const emptyForm = {
    fund_name: '', amfi_code: '', fund_type: 'Equity MF',
    units: '', purchase_nav: '', purchase_date: '', folio: '', notes: '', pan: '',
  };
  const [form, setForm] = useState(emptyForm);

  // Load user list
  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .catch(() => {});
  }, []);

  // Load SIF schemes once (for the search dropdown)
  useEffect(() => {
    fetch('/api/sif-nav')
      .then(r => r.json())
      .then(d => setSifSchemes(d.schemes || []))
      .catch(() => {});
  }, []);

  // Load holdings + resolve live NAVs when user selected
  useEffect(() => {
    if (!selUserId) { setHoldings([]); setNavMap({}); return; }
    setLoading(true);
    fetch(`/api/admin/holdings?userId=${selUserId}`)
      .then(r => r.json())
      .then(async d => {
        const rows = d.holdings || [];
        setHoldings(rows);
        // Build NAV map: SIF from /api/sif-nav, others from AMFI
        const nm = {};
        const hasSIF   = rows.some(h => h.fund_type === 'SIF' && h.amfi_code);
        const mfCodes  = rows
          .filter(h => h.fund_type !== 'SIF' && h.amfi_code)
          .map(h => h.amfi_code.trim())
          .filter(Boolean);

        // SIF NAVs
        if (hasSIF) {
          try {
            const r2 = await fetch('/api/sif-nav');
            if (r2.ok) {
              const sd = await r2.json();
              (sd.schemes || []).forEach(s => {
                nm[s.scheme_id] = s.nav;
              });
            }
          } catch {}
        }

        // MF NAVs from AMFI (individual calls, concurrently, capped at 10)
        if (mfCodes.length) {
          await Promise.allSettled(
            mfCodes.slice(0, 10).map(async code => {
              try {
                const r3 = await fetch(`https://api.mfapi.in/mf/${code}/latest`);
                if (r3.ok) {
                  const md = await r3.json();
                  const nav = parseFloat(md?.data?.[0]?.nav);
                  if (!isNaN(nav)) nm[code] = nav;
                }
              } catch {}
            })
          );
        }
        setNavMap(nm);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selUserId]);

  function openNew() {
    setForm(emptyForm);
    setEditIdx(null);
    setSifSearch('');
    setShowSifDrop(false);
    setShowForm(true);
  }

  function openEdit(idx) {
    const h = holdings[idx];
    setForm({
      fund_name:     h.fund_name     || '',
      amfi_code:     h.amfi_code     || '',
      fund_type:     h.fund_type     || 'Equity MF',
      units:         String(h.units  || ''),
      purchase_nav:  String(h.purchase_nav || ''),
      purchase_date: h.purchase_date ? h.purchase_date.split('T')[0] : '',
      folio:         h.folio         || '',
      notes:         h.notes         || '',
      pan:           h.pan           || '',
    });
    setSifSearch(h.fund_name || '');
    setShowSifDrop(false);
    setEditIdx(idx);
    setShowForm(true);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this holding?')) return;
    const res = await fetch(`/api/admin/holdings?id=${id}&userId=${selUserId}`, { method: 'DELETE' });
    if (res.ok) setHoldings(prev => prev.filter(h => h.id !== id));
    else alert('Delete failed');
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const payload = {
        userId: selUserId,
        fund_name:     form.fund_name.trim(),
        amfi_code:     form.amfi_code.trim() || null,
        fund_type:     form.fund_type,
        units:         parseFloat(form.units),
        purchase_nav:  parseFloat(form.purchase_nav),
        purchase_date: form.purchase_date || null,
        folio:         form.folio.trim()  || null,
        notes:         form.notes.trim()  || null,
        pan:           form.pan.trim().toUpperCase() || null,
        ...(editIdx !== null ? { id: holdings[editIdx].id } : {}),
      };
      if (!payload.fund_name || isNaN(payload.units) || isNaN(payload.purchase_nav)) {
        throw new Error('Fund name, units, and purchase NAV are required');
      }
      const res = await fetch('/api/admin/holdings', {
        method: editIdx !== null ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      // Update local holdings and re-resolve NAV for new holding
      let updated;
      if (editIdx !== null) {
        updated = holdings.map((h, i) => i === editIdx ? d.holding : h);
      } else {
        updated = [...holdings, d.holding];
      }
      setHoldings(updated);
      // If new MF code was added, fetch its NAV
      if (payload.fund_type !== 'SIF' && payload.amfi_code && !navMap[payload.amfi_code]) {
        try {
          const r2 = await fetch(`https://api.mfapi.in/mf/${payload.amfi_code}/latest`);
          if (r2.ok) {
            const md = await r2.json();
            const nav = parseFloat(md?.data?.[0]?.nav);
            if (!isNaN(nav)) setNavMap(prev => ({ ...prev, [payload.amfi_code]: nav }));
          }
        } catch {}
      }
      setMsg({ type: 'ok', text: editIdx !== null ? 'Holding updated' : 'Holding added' });
      setShowForm(false);
      setSifSearch('');
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // SIF scheme filtered list
  const sifFiltered = sifSchemes.filter(s => {
    const q = sifSearch.toLowerCase();
    return !q || s.nav_name.toLowerCase().includes(q) || s.sif_name.toLowerCase().includes(q) || s.scheme_id.toLowerCase().includes(q);
  }).slice(0, 12);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>Select Client</div>
          <select
            value={selUserId}
            onChange={e => { setSelUserId(e.target.value); setShowForm(false); setMsg({ type: '', text: '' }); }}
            style={{
              padding: '9px 14px', border: '1.5px solid var(--border2)',
              borderRadius: 9, fontFamily: 'Raleway, sans-serif',
              fontSize: '.78rem', fontWeight: 700,
              background: 'var(--s2)', color: 'var(--text)', outline: 'none',
              minWidth: 260,
            }}
          >
            <option value="">— choose client —</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>
            ))}
          </select>
        </div>
        {selUserId && (
          <button onClick={openNew} className="submit-btn" style={{ width: 'auto', padding: '9px 20px', marginTop: 0 }}>
            + Add Holding
          </button>
        )}
      </div>

      {msg.text && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: msg.type === 'ok' ? 'var(--g-xlight)' : 'var(--neg-bg)',
          border: `1.5px solid ${msg.type === 'ok' ? 'var(--g-light)' : '#ffcdd2'}`,
          fontSize: '.75rem', fontWeight: 600,
          color: msg.type === 'ok' ? 'var(--g1)' : 'var(--neg)',
        }}>
          {msg.type === 'ok' ? '✓' : '⚠'} {msg.text}
        </div>
      )}

      {/* ── Add / Edit form ─────────────────────────────────────────────── */}
      {showForm && (
        <div className="upload-card" style={{ margin: '0 0 20px', maxWidth: 600 }}>
          <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--g1)', marginBottom: 16 }}>
            {editIdx !== null ? 'Edit Holding' : 'Add New Holding'}
          </div>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>

              <div>
                <div className="field-label">Fund Type *</div>
                <select value={form.fund_type}
                  onChange={e => {
                    const t = e.target.value;
                    setForm(f => ({ ...f, fund_type: t, amfi_code: '', fund_name: t === 'SIF' ? '' : f.fund_name }));
                    setSifSearch('');
                    setShowSifDrop(false);
                  }}
                  style={{
                    width: '100%', padding: '10px 14px',
                    border: '1.5px solid var(--border2)', borderRadius: 10,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '.78rem',
                    background: 'var(--s2)', color: 'var(--text)', outline: 'none',
                  }}>
                  {FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* SIF: searchable picker replaces both fund_name and amfi_code */}
              {form.fund_type === 'SIF' ? (
                <div style={{ gridColumn: '1/-1', position: 'relative' }}>
                  <div className="field-label">SIF Scheme *</div>
                  <input
                    type="text"
                    required
                    value={sifSearch}
                    onChange={e => {
                      setSifSearch(e.target.value);
                      setShowSifDrop(true);
                      // clear selection if user edits after picking
                      setForm(f => ({ ...f, fund_name: '', amfi_code: '' }));
                    }}
                    onFocus={() => setShowSifDrop(true)}
                    placeholder="Search by fund name or scheme ID (e.g. Magnum, SIF-14)"
                    className="field-input"
                    autoComplete="off"
                  />
                  {form.amfi_code && (
                    <div style={{
                      marginTop: 4, fontSize: '.62rem', color: 'var(--g1)', fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      ✓ {form.amfi_code} selected — {form.fund_name}
                    </div>
                  )}
                  {showSifDrop && sifFiltered.length > 0 && !form.amfi_code && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                      background: 'var(--surface)', border: '1.5px solid var(--border2)',
                      borderRadius: 10, boxShadow: 'var(--shadow)',
                      maxHeight: 280, overflowY: 'auto', marginTop: 2,
                    }}>
                      {sifFiltered.map(s => (
                        <button
                          key={s.scheme_id}
                          type="button"
                          onClick={() => {
                            setForm(f => ({ ...f, fund_name: s.nav_name, amfi_code: s.scheme_id }));
                            setSifSearch(s.nav_name);
                            setShowSifDrop(false);
                          }}
                          style={{
                            display: 'block', width: '100%', padding: '10px 14px',
                            textAlign: 'left', border: 'none', borderBottom: '1px solid var(--border)',
                            background: 'transparent', cursor: 'pointer',
                            fontFamily: 'Raleway, sans-serif',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--g-xlight)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text)' }}>
                            {s.nav_name}
                          </div>
                          <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                            {s.scheme_id} · {s.sif_name} · NAV ₹{s.nav} ({s.nav_date})
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ gridColumn: '1/-1' }}>
                    <div className="field-label">Fund Name *</div>
                    <input type="text" required value={form.fund_name}
                      onChange={e => setForm(f => ({ ...f, fund_name: e.target.value }))}
                      placeholder="e.g. Mirae Asset Large Cap Fund — Direct Growth"
                      className="field-input" />
                  </div>
                  <div>
                    <div className="field-label">AMFI Code (for live NAV)</div>
                    <input type="text" value={form.amfi_code}
                      onChange={e => setForm(f => ({ ...f, amfi_code: e.target.value }))}
                      placeholder="e.g. 118834"
                      className="field-input" />
                  </div>
                </>
              )}

              <div>
                <div className="field-label">Units *</div>
                <input type="number" required step="any" min="0" value={form.units}
                  onChange={e => setForm(f => ({ ...f, units: e.target.value }))}
                  placeholder="e.g. 123.456"
                  className="field-input" />
              </div>

              <div>
                <div className="field-label">Purchase NAV *</div>
                <input type="number" required step="any" min="0" value={form.purchase_nav}
                  onChange={e => setForm(f => ({ ...f, purchase_nav: e.target.value }))}
                  placeholder="e.g. 45.23"
                  className="field-input" />
              </div>

              <div>
                <div className="field-label">Purchase Date</div>
                <input type="date" value={form.purchase_date}
                  onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                  className="field-input" />
              </div>

              <div>
                <div className="field-label">Folio Number</div>
                <input type="text" value={form.folio}
                  onChange={e => setForm(f => ({ ...f, folio: e.target.value }))}
                  placeholder="optional"
                  className="field-input" />
              </div>

              <div>
                <div className="field-label">PAN of Holder</div>
                <input type="text" value={form.pan || ''}
                  onChange={e => setForm(f => ({ ...f, pan: e.target.value.toUpperCase() }))}
                  placeholder="e.g. ABCDE1234F"
                  maxLength={10}
                  className="field-input"
                  style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '1px' }} />
                <div style={{ fontSize: '.58rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
                  Links this holding to the correct family member in the client portfolio view
                </div>
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <div className="field-label">Notes</div>
                <input type="text" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. pre-statement purchase"
                  className="field-input" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="submit" className="submit-btn" disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Saving…' : (editIdx !== null ? 'Update Holding' : 'Add Holding')}
              </button>
              <button type="button"
                onClick={() => { setShowForm(false); setMsg({ type: '', text: '' }); setSifSearch(''); setShowSifDrop(false); }}
                style={{
                  padding: '12px 20px', border: '1.5px solid var(--border)',
                  borderRadius: 10, background: 'var(--s2)', cursor: 'pointer',
                  fontSize: '.8rem', fontWeight: 700, color: 'var(--muted)',
                  fontFamily: 'Raleway, sans-serif',
                }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Holdings table ───────────────────────────────────────────────── */}
      {selUserId && !loading && holdings.length > 0 && (
        <div className="table-card">
          <div className="table-wrap">
            <table className="idx-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingLeft: 16 }}>Fund</th>
                  <th>Type</th>
                  <th>Units</th>
                  <th>Purchase NAV</th>
                  <th>Current NAV</th>
                  <th>Current Value</th>
                  <th>Gain / Loss</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => {
                  const purchaseNav = parseFloat(h.purchase_nav);
                  const units       = parseFloat(h.units);
                  const liveNav     = h.amfi_code ? (navMap[h.amfi_code.trim()] ?? null) : null;
                  const currentVal  = liveNav != null ? units * liveNav : units * purchaseNav;
                  const invested    = units * purchaseNav;
                  const gain        = currentVal - invested;
                  const gainPct     = invested > 0 ? ((gain / invested) * 100).toFixed(2) : '0.00';
                  const isProfit    = gain >= 0;
                  const hasLive     = liveNav != null;

                  return (
                    <tr key={h.id}>
                      <td style={{ textAlign: 'left', paddingLeft: 16 }}>
                        <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text)' }}>{h.fund_name}</div>
                        {h.notes && (
                          <div style={{ fontSize: '.58rem', color: 'var(--muted)', marginTop: 2 }}>{h.notes}</div>
                        )}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '.52rem', fontWeight: 800, padding: '2px 6px',
                          borderRadius: 4, background: h.fund_type === 'SIF' ? '#e0f2f1' : 'var(--s2)',
                          color: h.fund_type === 'SIF' ? '#00695c' : 'var(--muted)',
                          border: '1px solid var(--border)',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          {h.fund_type}
                        </span>
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{units.toFixed(4)}</td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>₹{purchaseNav.toFixed(4)}</td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {hasLive
                          ? <span>₹{liveNav.toFixed(4)} <span style={{ fontSize: '.52rem', color: 'var(--g1)' }}>●</span></span>
                          : <span style={{ color: 'var(--muted)' }}>—</span>
                        }
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                        ₹{Math.round(currentVal).toLocaleString('en-IN')}
                        {!hasLive && <div style={{ fontSize: '.52rem', color: 'var(--muted)', fontWeight: 400 }}>est.</div>}
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        <span style={{ color: isProfit ? 'var(--pos)' : 'var(--neg)', fontWeight: 700 }}>
                          {isProfit ? '+' : ''}{gainPct}%
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button onClick={() => openEdit(i)}
                            style={{
                              padding: '3px 10px', borderRadius: 6, border: '1.5px solid var(--border)',
                              background: 'var(--s2)', cursor: 'pointer', fontSize: '.65rem',
                              fontWeight: 700, color: 'var(--g2)', fontFamily: 'Raleway, sans-serif',
                            }}>
                            Edit
                          </button>
                          <button onClick={() => handleDelete(h.id)}
                            style={{
                              padding: '3px 10px', borderRadius: 6, border: '1.5px solid #ffcdd2',
                              background: 'var(--neg-bg)', cursor: 'pointer', fontSize: '.65rem',
                              fontWeight: 700, color: 'var(--neg)', fontFamily: 'Raleway, sans-serif',
                            }}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="src-text">
            Current NAV: SIF from AMFI · MF from mfapi.in · Live indicator ● = NAV fetched
          </div>
        </div>
      )}

      {selUserId && !loading && holdings.length === 0 && !showForm && (
        <div className="empty-state" style={{ padding: '40px 24px' }}>
          <div className="empty-icon">📋</div>
          <div className="empty-title">No manual holdings</div>
          <div className="empty-sub">Click "Add Holding" to add a mutual fund or SIF holding for this client.</div>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => <div key={i} className="sk" style={{ height: 44, borderRadius: 8 }} />)}
        </div>
      )}
    </div>
  );
}
