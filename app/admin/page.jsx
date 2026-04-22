'use client';

/**
 * app/admin/page.jsx — Admin Panel
 *
 * Three tabs:
 *   1. Users        — list, role management, view CAS portfolios
 *   2. Add Client   — create pending user by email, upload CAS on their behalf
 *   3. Holdings     — add/edit manual MF or SIF holdings for any user
 */

import { useSession } from 'next-auth/react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// ── Shared helpers ──────────────────────────────────────────────────────────

const ROLE_STYLES = {
  admin:       { background: '#fff3e0', color: '#e65100', border: '#ffe0b2' },
  distributor: { background: '#e8f5e9', color: '#1b5e20', border: '#c8e6c9' },
  client:      { background: 'var(--s2)', color: 'var(--muted)', border: 'var(--border)' },
  pending:     { background: '#e3f2fd', color: '#1565c0', border: '#bbdefb' },
};

function RoleBadge({ role }) {
  const s = ROLE_STYLES[role] || ROLE_STYLES.client;
  return (
    <span style={{
      fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px',
      textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4,
      fontFamily: "'JetBrains Mono', monospace",
      background: s.background, color: s.color,
      border: `1px solid ${s.border}`,
    }}>
      {role}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TAB_STYLE = (active) => ({
  padding: '10px 20px', border: 'none', background: 'transparent',
  fontFamily: 'Raleway, sans-serif', fontSize: '.78rem', fontWeight: 700,
  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  borderBottom: `2.5px solid ${active ? 'var(--g2)' : 'transparent'}`,
  color: active ? 'var(--g1)' : 'var(--muted)',
  marginBottom: -1.5, transition: 'color .15s, border-color .15s',
});

// ── Tab 1: Users ─────────────────────────────────────────────────────────────

function UsersTab({ session }) {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [portfolios, setPortfolios]     = useState([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [roleChanging, setRoleChanging] = useState('');

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setUsers(d.users); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function selectUser(user) {
    setSelectedUser(user);
    setPortfolios([]);
    setPortsLoading(true);
    fetch(`/api/cas/list?userId=${user.id}`)
      .then(r => r.json())
      .then(d => setPortfolios(d.portfolios || []))
      .catch(() => {})
      .finally(() => setPortsLoading(false));
  }

  async function changeRole(userId, newRole) {
    setRoleChanging(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (e) { alert(e.message); }
    finally { setRoleChanging(''); }
  }

  if (error) return <div className="error-box">⚠ {error}</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 340px' : '1fr', gap: 20 }}>
      <div className="table-card">
        <div className="table-wrap">
          <table className="idx-table" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingLeft: 16 }}>User</th>
                <th>Role</th>
                <th>Portfolios</th>
                <th>Last Upload</th>
                <th>Joined</th>
                <th style={{ textAlign: 'center' }}>Change Role</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[180, 60, 50, 80, 80, 100].map((w, j) => (
                      <td key={j}><div className="sk" style={{ width: w, height: 13 }} /></td>
                    ))}
                  </tr>
                ))
              ) : users.map(u => (
                <tr
                  key={u.id}
                  onClick={() => selectUser(u)}
                  style={{ cursor: 'pointer', background: selectedUser?.id === u.id ? 'var(--g-xlight)' : undefined }}
                >
                  <td style={{ textAlign: 'left', paddingLeft: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      {u.image ? (
                        <img src={u.image} alt="" width={26} height={26}
                          style={{ borderRadius: '50%', flexShrink: 0 }}
                          referrerPolicy="no-referrer" />
                      ) : (
                        <div style={{
                          width: 26, height: 26, borderRadius: '50%',
                          background: 'var(--s3)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '.6rem', fontWeight: 800, color: 'var(--g2)',
                        }}>
                          {(u.name || u.email || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text)' }}>
                          {u.name || <em style={{ color: 'var(--muted)' }}>Pending</em>}
                          {u.id === session.user.id && (
                            <span style={{ fontSize: '.52rem', color: 'var(--muted)', marginLeft: 6 }}>(you)</span>
                          )}
                        </div>
                        <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}><RoleBadge role={u.role} /></td>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
                    {u.portfolio_count || 0}
                  </td>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '.65rem' }}>{fmtDate(u.last_upload)}</td>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '.65rem' }}>{fmtDate(u.created_at)}</td>
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <select
                      value={u.role}
                      disabled={roleChanging === u.id || u.id === session.user.id}
                      onChange={e => changeRole(u.id, e.target.value)}
                      style={{
                        fontSize: '.65rem', fontWeight: 700,
                        border: '1.5px solid var(--border)', borderRadius: 6,
                        background: 'var(--s2)', color: 'var(--text)',
                        padding: '3px 6px', cursor: 'pointer',
                        fontFamily: "'Raleway', sans-serif",
                        opacity: roleChanging === u.id ? 0.5 : 1,
                      }}
                    >
                      <option value="client">client</option>
                      <option value="distributor">distributor</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="src-text">Click a row to view that user's CAS uploads</div>
      </div>

      {selectedUser && (
        <div className="table-card" style={{ height: 'fit-content' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text)' }}>
                  {selectedUser.name || selectedUser.email}
                </div>
                <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedUser.email}
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '.9rem', color: 'var(--muted)', padding: 4 }}>
                ✕
              </button>
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <div style={{
              fontSize: '.58rem', fontWeight: 800, letterSpacing: '1.5px',
              textTransform: 'uppercase', color: 'var(--muted)',
              fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
            }}>
              CAS Portfolios ({portfolios.length})
            </div>
            {portsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2].map(i => <div key={i} className="sk" style={{ height: 52, borderRadius: 10 }} />)}
              </div>
            ) : portfolios.length === 0 ? (
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
                No uploads yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {portfolios.map(p => (
                  <div key={p.id} style={{
                    padding: '10px 12px', borderRadius: 10,
                    border: '1.5px solid var(--border)', background: 'var(--s2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
                        📄 {p.file_name}
                      </div>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {p.pan_count} PAN{p.pan_count !== 1 ? 's' : ''} · {fmtDate(p.uploaded_at)}
                      </div>
                    </div>
                    <a
                      href={`/cas-tracker?load=${encodeURIComponent(p.blob_key)}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{
                        flexShrink: 0, fontSize: '.65rem', fontWeight: 700,
                        padding: '5px 11px', borderRadius: 6,
                        background: 'var(--g1)', color: '#fff',
                        textDecoration: 'none', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--g2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                    >
                      View →
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Add Client ────────────────────────────────────────────────────────

function AddClientTab() {
  const [email, setEmail]       = useState('');
  const [name, setName]         = useState('');
  const [step, setStep]         = useState('form'); // form | uploading | done | error
  const [msg, setMsg]           = useState('');
  const [userId, setUserId]     = useState('');
  const [pdfFile, setPdfFile]   = useState(null);
  const [password, setPassword] = useState('');
  const [parsing, setParsing]   = useState(false);

  async function handleCreateUser(e) {
    e.preventDefault();
    setStep('uploading');
    setMsg('Creating client account…');
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), name: name.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setUserId(d.userId);
      setMsg(`Account ${d.created ? 'created' : 'found'} for ${email}. Optionally upload their CAS below.`);
      setStep('upload');
    } catch (err) {
      setMsg(err.message);
      setStep('error');
    }
  }

  async function handleUploadCas(e) {
    e.preventDefault();
    if (!pdfFile || !userId) return;
    setParsing(true);
    setMsg('Parsing CAS…');
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('password', password);
      const parseRes = await fetch('/api/parse', { method: 'POST', body: formData });
      if (!parseRes.ok) {
        const err = await parseRes.json().catch(() => ({}));
        throw new Error(err.detail || (parseRes.status === 401 ? 'Incorrect password' : 'Parse failed'));
      }
      const data = await parseRes.json();
      setMsg('Saving portfolio…');
      const panCount = new Set(
        (data.folios || []).map(f => (f.PAN || '').toUpperCase().trim()).filter(p => p.length === 10)
      ).size;
      const saveRes = await fetch('/api/cas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedData: data, fileName: pdfFile.name, panCount, targetUserId: userId }),
      });
      if (!saveRes.ok) throw new Error('Failed to save portfolio');
      setMsg(`Done! Portfolio saved for ${email}.`);
      setStep('done');
    } catch (err) {
      setMsg(err.message);
    } finally {
      setParsing(false);
    }
  }

  function reset() {
    setEmail(''); setName(''); setStep('form'); setMsg('');
    setUserId(''); setPdfFile(null); setPassword('');
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="page-eyebrow" style={{ marginBottom: 6 }}>
          <span className="eyebrow-text">Add New Client</span>
        </div>
        <p style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          Create an account for a client using their email. They can later sign in with Google
          using the same email and access their pre-loaded portfolio.
        </p>
      </div>

      {(step === 'form' || step === 'error') && (
        <form onSubmit={handleCreateUser} className="upload-card" style={{ margin: 0 }}>
          <div style={{ marginBottom: 16 }}>
            <div className="field-label">Client Email *</div>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="client@example.com"
              className="field-input"
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div className="field-label">Client Name (optional)</div>
            <input
              type="text" value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              className="field-input"
            />
          </div>
          {step === 'error' && (
            <div className="error-box" style={{ marginBottom: 14 }}>⚠ {msg}</div>
          )}
          <button type="submit" className="submit-btn">
            Create / Find Client Account
          </button>
        </form>
      )}

      {step === 'uploading' && (
        <div className="upload-card" style={{ margin: 0, textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <div className="loading-text">{msg}</div>
        </div>
      )}

      {(step === 'upload' || step === 'done') && (
        <div className="upload-card" style={{ margin: 0 }}>
          <div style={{
            padding: '10px 14px', borderRadius: 8, marginBottom: 20,
            background: 'var(--g-xlight)', border: '1.5px solid var(--g-light)',
            fontSize: '.75rem', color: 'var(--g1)', fontWeight: 600,
          }}>
            ✓ {msg}
          </div>

          {step === 'upload' && (
            <>
              <div style={{
                fontSize: '.62rem', fontWeight: 800, letterSpacing: '1.5px',
                textTransform: 'uppercase', color: 'var(--muted)',
                fontFamily: "'JetBrains Mono', monospace", marginBottom: 14,
              }}>
                Upload CAS for this client (optional)
              </div>
              <form onSubmit={handleUploadCas}>
                <div style={{ marginBottom: 14 }}>
                  <div className="field-label">CAS PDF File</div>
                  <input type="file" accept=".pdf" required
                    className="file-input"
                    onChange={e => setPdfFile(e.target.files[0])} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div className="field-label">PDF Password</div>
                  <input type="password" value={password} required
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter PDF password"
                    className="field-input" />
                </div>
                <button type="submit" className="submit-btn" disabled={parsing}>
                  {parsing ? 'Parsing…' : '🔓 Parse & Save CAS'}
                </button>
              </form>
            </>
          )}

          <button onClick={reset} style={{
            marginTop: 14, width: '100%', padding: '9px',
            border: '1.5px solid var(--border)', borderRadius: 9,
            background: 'var(--s2)', cursor: 'pointer',
            fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)',
            fontFamily: 'Raleway, sans-serif',
          }}>
            Add another client
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Manual Holdings ──────────────────────────────────────────────────

const FUND_TYPES = ['Equity MF', 'Debt MF', 'Hybrid MF', 'Index Fund / ETF', 'SIF', 'Other'];

function ManualHoldingsTab() {
  const [users, setUsers]           = useState([]);
  const [selUserId, setSelUserId]   = useState('');
  const [holdings, setHoldings]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState({ type: '', text: '' });
  const [showForm, setShowForm]     = useState(false);
  const [editIdx, setEditIdx]       = useState(null); // null = new

  const emptyForm = {
    fund_name: '', amfi_code: '', fund_type: 'Equity MF',
    units: '', purchase_nav: '', purchase_date: '', folio: '', notes: '',
  };
  const [form, setForm] = useState(emptyForm);

  // Load user list
  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => setUsers(d.users || []))
      .catch(() => {});
  }, []);

  // Load holdings when user selected
  useEffect(() => {
    if (!selUserId) { setHoldings([]); return; }
    setLoading(true);
    fetch(`/api/admin/holdings?userId=${selUserId}`)
      .then(r => r.json())
      .then(d => setHoldings(d.holdings || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selUserId]);

  function openNew() {
    setForm(emptyForm);
    setEditIdx(null);
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
    });
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
      if (editIdx !== null) {
        setHoldings(prev => prev.map((h, i) => i === editIdx ? d.holding : h));
      } else {
        setHoldings(prev => [...prev, d.holding]);
      }
      setMsg({ type: 'ok', text: editIdx !== null ? 'Holding updated' : 'Holding added' });
      setShowForm(false);
    } catch (err) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  }

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

      {/* Add / Edit form */}
      {showForm && (
        <div className="upload-card" style={{ margin: '0 0 20px', maxWidth: 600 }}>
          <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--g1)', marginBottom: 16 }}>
            {editIdx !== null ? 'Edit Holding' : 'Add New Holding'}
          </div>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>

              <div style={{ gridColumn: '1/-1' }}>
                <div className="field-label">Fund Name *</div>
                <input type="text" required value={form.fund_name}
                  onChange={e => setForm(f => ({ ...f, fund_name: e.target.value }))}
                  placeholder="e.g. Mirae Asset Large Cap Fund — Direct Growth"
                  className="field-input" />
              </div>

              <div>
                <div className="field-label">Fund Type *</div>
                <select value={form.fund_type}
                  onChange={e => setForm(f => ({ ...f, fund_type: e.target.value }))}
                  style={{
                    width: '100%', padding: '10px 14px',
                    border: '1.5px solid var(--border2)', borderRadius: 10,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '.78rem',
                    background: 'var(--s2)', color: 'var(--text)', outline: 'none',
                  }}>
                  {FUND_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <div className="field-label">AMFI Code</div>
                <input type="text" value={form.amfi_code}
                  onChange={e => setForm(f => ({ ...f, amfi_code: e.target.value }))}
                  placeholder="e.g. 118834 (for live NAV)"
                  className="field-input" />
              </div>

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

              <div style={{ gridColumn: '1/-1' }}>
                <div className="field-label">Notes</div>
                <input type="text" value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. SIF — manually entered, pre-statement purchase"
                  className="field-input" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="submit" className="submit-btn" disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Saving…' : (editIdx !== null ? 'Update Holding' : 'Add Holding')}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setMsg({ type: '', text: '' }); }}
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

      {/* Holdings table */}
      {selUserId && !loading && holdings.length > 0 && (
        <div className="table-card">
          <div className="table-wrap">
            <table className="idx-table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingLeft: 16 }}>Fund</th>
                  <th>Type</th>
                  <th>Units</th>
                  <th>Purchase NAV</th>
                  <th>Purchase Date</th>
                  <th>Folio</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => (
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
                    <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{parseFloat(h.units).toFixed(4)}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>₹{parseFloat(h.purchase_nav).toFixed(4)}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '.65rem' }}>{fmtDate(h.purchase_date)}</td>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '.65rem' }}>{h.folio || '—'}</td>
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
                ))}
              </tbody>
            </table>
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

// ── Main Admin Page ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState('users');

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?from=/admin');
    if (status === 'authenticated' && session?.user?.role !== 'admin') router.replace('/');
  }, [status, session, router]);

  if (status === 'loading' || (status === 'authenticated' && session?.user?.role !== 'admin')) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sk" style={{ width: 120, height: 16, borderRadius: 8 }} />
      </div>
    );
  }

  return (
    <>
      <div className="container">
        <Navbar />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot" />
            <span className="eyebrow-text">Admin Panel</span>
          </div>
          <h1 className="page-title">Distributor <span>Dashboard</span></h1>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', borderBottom: '1.5px solid var(--border)',
          marginBottom: 24, gap: 0, overflowX: 'auto',
        }}>
          {[
            { key: 'users',    label: '👥 Users' },
            { key: 'addclient',label: '➕ Add Client' },
            { key: 'holdings', label: '📋 Manual Holdings' },
          ].map(t => (
            <button key={t.key} style={TAB_STYLE(tab === t.key)} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'users'     && <UsersTab session={session} />}
        {tab === 'addclient' && <AddClientTab />}
        {tab === 'holdings'  && <ManualHoldingsTab />}
      </div>
      <Footer />
    </>
  );
}
