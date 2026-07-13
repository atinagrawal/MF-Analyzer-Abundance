# Admin Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `app/admin/page.jsx` so it's genuinely responsive (mobile/tablet/desktop equally), consistent with the rest of the site's interaction patterns (no browser `confirm()`/`alert()`), and split into maintainable per-tab files — plus add MF Central `.xlsx` CAS upload support to the Add Client tab.

**Architecture:** Split the current 1129-line single-file `app/admin/page.jsx` into a thin page wrapper plus three tab component files (`UsersTab.jsx`, `AddClientTab.jsx`, `ManualHoldingsTab.jsx`), each responsible for one tab. All inline styling moves to a new `app/admin/admin.css`. Users and Manual Holdings both render **two** representations of their list (a `<table>` for desktop, a card list for mobile/tablet) and toggle visibility with a CSS media query at 768px — no JS viewport detection, no hydration-mismatch risk.

**Tech Stack:** Next.js 16 App Router, React (client components), plain CSS (no CSS-in-JS, no Tailwind) — matches the rest of this codebase exactly.

## Global Constraints

- Design tokens (colors, fonts) must reuse existing CSS variables from `app/globals.css` — `--g1`/`--g2`/`--g3` (forest green), `--neg` (red), `--muted`, `--border`, `--s2`/`--s3` (surface tints), etc. Do not invent new colors.
- Fonts: Raleway (body/UI text) + JetBrains Mono (numbers, codes, monospace data) — exactly as used elsewhere on this page today.
- Breakpoints: table→card switch (Users list, Holdings list) at **768px**. Manual Holdings form grid collapses to one column at **640px**. These are the two standard breakpoints already used sitewide — do not introduce a third.
- No new dependencies. No automated test suite is being introduced (matches existing project convention — this codebase relies on manual verification for UI work).
- Do not change any API route, database schema, or business logic — this is a layout/interaction-only redesign, except for the Add Client `.xlsx` wiring, which reuses the already-shipped `/api/parse-mfcentral` route verbatim (no route changes).
- Existing generic CSS classes (`.error-box`, `.empty-state`, `.field-label`, `.field-input`, `.submit-btn`, `.upload-card`, `.table-card`, `.idx-table`, `.table-wrap`, `.src-text`, `.page-eyebrow`, `.eyebrow-text`, `.page-title`, `.live-dot`, `.sk`, `.spinner`, `.loading-text`) already exist in `app/globals.css` and must be reused as-is, not redefined in `admin.css`.

---

## File Structure

- **Modify → Create (split):** `app/admin/page.jsx` — becomes a thin wrapper (~60 lines): auth guard, tab bar, imports the three tab components.
- **Create:** `app/admin/UsersTab.jsx` — Tab 1: user list/cards, drill-down detail view, consolidated role management, CAS portfolio view/delete/notify.
- **Create:** `app/admin/AddClientTab.jsx` — Tab 2: create client, upload CAS (`.pdf` or `.xlsx`) on their behalf.
- **Create:** `app/admin/ManualHoldingsTab.jsx` — Tab 3: manual MF/SIF holding add/edit/delete per client, responsive form and table/cards.
- **Create:** `app/admin/admin.css` — all styling for the above four files, imported once in `page.jsx`.

## Task 1: Split into files, extract CSS, no behavior change

**Files:**
- Create: `app/admin/admin.css`
- Create: `app/admin/UsersTab.jsx`
- Create: `app/admin/AddClientTab.jsx`
- Create: `app/admin/ManualHoldingsTab.jsx`
- Modify: `app/admin/page.jsx` (replace entirely)
- Test: manual (dev server, visual comparison — see Step 6)

**Interfaces:**
- Produces: `UsersTab` default export (props: `{ session }`), `AddClientTab` default export (props: none), `ManualHoldingsTab` default export (props: none) — these exact signatures are consumed by `page.jsx` and must not change in later tasks.
- Produces: `admin.css` — base structural classes (`.admin-tab-bar`, `.admin-tab-btn`) that Task 2–4 will extend with new classes, never redefining these.

This task is a **pure mechanical split** — every line of behavior stays identical to the current file. Task 2–4 add the actual redesign on top of this foundation.

- [ ] **Step 1: Create `app/admin/admin.css` with the tab-bar styles extracted from the current inline `TAB_STYLE` function and tab-bar wrapper**

```css
/* app/admin/admin.css — Admin Panel styles. Reuses design tokens from
   app/globals.css (--g1/--g2/--g3, --neg, --muted, --border, --s2/--s3,
   etc.) — never redefine those here. */

.admin-tab-bar {
  display: flex;
  border-bottom: 1.5px solid var(--border);
  margin-bottom: 24px;
  gap: 0;
  overflow-x: auto;
}

.admin-tab-btn {
  padding: 10px 20px;
  border: none;
  background: transparent;
  font-family: 'Raleway', sans-serif;
  font-size: .78rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  border-bottom: 2.5px solid transparent;
  color: var(--muted);
  margin-bottom: -1.5px;
  transition: color .15s, border-color .15s;
}

.admin-tab-btn.active {
  color: var(--g1);
  border-bottom-color: var(--g2);
}
```

- [ ] **Step 2: Create `app/admin/UsersTab.jsx` with the exact current Tab 1 content (mechanical move, no behavior change)**

```jsx
'use client';

import { useState, useEffect } from 'react';

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

export default function UsersTab({ session }) {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [portfolios, setPortfolios]     = useState([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [roleChanging, setRoleChanging] = useState('');
  const [notifying,    setNotifying]    = useState('');
  const [notifyMsg,    setNotifyMsg]    = useState({ id: '', type: '', text: '' });
  const [deletingId,     setDeletingId]     = useState('');
  const [deleteInFlight, setDeleteInFlight] = useState(false);

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

  async function notifyClient(portfolio) {
    setNotifying(portfolio.id);
    setNotifyMsg({ id: '', type: '', text: '' });
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id, email: selectedUser.email,
          name: selectedUser.name, fileName: portfolio.file_name,
          blobKey: portfolio.blob_key, panCount: portfolio.pan_count,
          uploadedAt: portfolio.uploaded_at,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to send');
      setNotifyMsg({ id: portfolio.id, type: 'ok', text: 'Sent ✓' });
    } catch (err) {
      setNotifyMsg({ id: portfolio.id, type: 'err', text: err.message });
    } finally { setNotifying(''); }
  }

  async function deletePortfolio(id) {
    setDeleteInFlight(true);
    try {
      const res = await fetch('/api/cas/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setPortfolios(prev => prev.filter(p => p.id !== id));
      }
    } catch { /* non-fatal — entry stays, admin can retry */ }
    setDeleteInFlight(false);
    setDeletingId('');
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
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 12 }}>
                  No CAS uploads yet
                </div>
                <a
                  href={`/cas-tracker?userId=${selectedUser.id}&uname=${encodeURIComponent(selectedUser.name || selectedUser.email || '')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'inline-block', fontSize: '.65rem', fontWeight: 700,
                    padding: '7px 14px', borderRadius: 7,
                    background: 'var(--g1)', color: '#fff',
                    textDecoration: 'none', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--g2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                >
                  View Manual Holdings →
                </a>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {portfolios.map(p => (
                  <div key={p.id} style={{
                    padding: '10px 12px', borderRadius: 10,
                    border: '1.5px solid var(--border)', background: 'var(--s2)',
                  }}>
                    {deletingId === p.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Delete "{p.file_name}"?
                        </span>
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                          <button onClick={() => deletePortfolio(p.id)} disabled={deleteInFlight}
                            style={{ fontSize: '.62rem', fontWeight: 800, color: '#fff', background: 'var(--neg)',
                              border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
                            {deleteInFlight ? '…' : 'Delete'}
                          </button>
                          <button onClick={() => setDeletingId('')} disabled={deleteInFlight}
                            style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted)', background: 'none',
                              border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
                            📄 {p.file_name}
                          </div>
                          <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                            {p.pan_count} PAN{p.pan_count !== 1 ? 's' : ''} · {fmtDate(p.uploaded_at)}
                          </div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0, alignItems:'flex-end' }}>
                          <div style={{ display:'flex', gap:5 }}>
                            <button onClick={e=>{e.stopPropagation();notifyClient(p);}} disabled={notifying===p.id}
                              style={{ fontSize:'.6rem', fontWeight:700, padding:'4px 9px', borderRadius:6,
                                border:'1.5px solid var(--border)', background:notifying===p.id?'var(--s3)':'var(--s2)',
                                color:'var(--g2)', cursor:notifying===p.id?'not-allowed':'pointer',
                                whiteSpace:'nowrap', fontFamily:'Raleway, sans-serif' }}>
                              {notifying===p.id?'…':'✉'}
                            </button>
                            <button onClick={e=>{e.stopPropagation();setDeletingId(p.id);}}
                              title="Delete this CAS upload"
                              style={{ fontSize:'.6rem', fontWeight:700, padding:'4px 9px', borderRadius:6,
                                border:'1.5px solid var(--border)', background:'var(--s2)',
                                color:'var(--muted)', cursor:'pointer',
                                whiteSpace:'nowrap', fontFamily:'Raleway, sans-serif' }}
                              onMouseEnter={e=>e.currentTarget.style.color='var(--neg)'}
                              onMouseLeave={e=>e.currentTarget.style.color='var(--muted)'}>
                              🗑
                            </button>
                            <a href={`/cas-tracker?load=${encodeURIComponent(p.blob_key)}`}
                              target="_blank" rel="noopener noreferrer"
                              onClick={e=>e.stopPropagation()}
                              style={{ fontSize:'.65rem', fontWeight:700, padding:'5px 11px', borderRadius:6,
                                background:'var(--g1)', color:'#fff', textDecoration:'none', whiteSpace:'nowrap' }}
                              onMouseEnter={e=>e.currentTarget.style.background='var(--g2)'}
                              onMouseLeave={e=>e.currentTarget.style.background='var(--g1)'}>
                              View →
                            </a>
                          </div>
                          {notifyMsg.id===p.id&&(
                            <div style={{ fontSize:'.58rem', fontWeight:700,
                              color:notifyMsg.type==='ok'?'var(--g1)':'var(--neg)' }}>
                              {notifyMsg.text}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
```

- [ ] **Step 3: Create `app/admin/AddClientTab.jsx` with the exact current Tab 2 content (mechanical move, no behavior change)**

```jsx
'use client';

import { useState } from 'react';

export default function AddClientTab() {
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
```

- [ ] **Step 4: Create `app/admin/ManualHoldingsTab.jsx` with the exact current Tab 3 content (mechanical move, no behavior change)**

```jsx
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
```

- [ ] **Step 5: Replace `app/admin/page.jsx` with the thin wrapper**

```jsx
'use client';

/**
 * app/admin/page.jsx — Admin Panel
 *
 * Three tabs (each its own file):
 *   1. UsersTab           — list, role management, view/delete CAS uploads
 *   2. AddClientTab        — create pending user by email, upload CAS on their behalf
 *   3. ManualHoldingsTab   — add/edit manual MF or SIF holdings for any user
 */

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import UsersTab from './UsersTab';
import AddClientTab from './AddClientTab';
import ManualHoldingsTab from './ManualHoldingsTab';
import './admin.css';

const TABS = [
  { key: 'users',     label: '👥 Users' },
  { key: 'addclient', label: '➕ Add Client' },
  { key: 'holdings',  label: '📋 Manual Holdings' },
];

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

        <div className="admin-tab-bar">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`admin-tab-btn ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
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
```

- [ ] **Step 6: Verify the split rendered nothing differently**

Run: `npm run dev`, then open `/admin` (signed in as an admin user).

Expected: page looks pixel-identical to before the split — tab bar, Users table + side panel on selection, Add Client form, Manual Holdings tab all behave exactly as they did in the single-file version. Click through all three tabs, select a user, add/edit/delete a manual holding, confirm nothing broke.

Also run a build check: `npm run build` (or `npx next build` if there's no separate build script) — must complete with no errors related to `app/admin/*`.

- [ ] **Step 7: Delete the old single-file content is already replaced — confirm no orphaned file**

Run: `ls app/admin/` (or `Get-ChildItem app/admin/` on Windows) — should show exactly `page.jsx`, `UsersTab.jsx`, `AddClientTab.jsx`, `ManualHoldingsTab.jsx`, `admin.css`. No `page.jsx.old` or similar leftover.

- [ ] **Step 8: Commit**

```bash
git add app/admin/page.jsx app/admin/UsersTab.jsx app/admin/AddClientTab.jsx app/admin/ManualHoldingsTab.jsx app/admin/admin.css
git commit -m "refactor(admin): split page.jsx into per-tab files, extract tab-bar CSS

Mechanical split only — page.jsx (1129 lines, three tabs, entirely
inline-styled) becomes a thin wrapper importing UsersTab.jsx,
AddClientTab.jsx, and ManualHoldingsTab.jsx. New admin.css holds the
tab-bar styles extracted from the old inline TAB_STYLE function. No
behavior or visual change — this is the foundation for the responsive
redesign in the following tasks."
```

---

## Task 2: Users tab — responsive cards, drill-down, consolidated role management

**Files:**
- Modify: `app/admin/UsersTab.jsx` (entire file — replace)
- Modify: `app/admin/admin.css` (append new classes)
- Test: manual (dev server, resize browser across 768px breakpoint)

**Interfaces:**
- Consumes: `UsersTab` still receives `{ session }` exactly as before (no prop signature change).
- Produces: no new exports consumed by other files — self-contained.

- [ ] **Step 1: Append the new CSS classes to `app/admin/admin.css`**

```css

/* ── Responsive visibility toggle — reused by Users and Manual Holdings ── */
.admin-desktop-only { display: block; }
.admin-mobile-only   { display: none; }

@media (max-width: 768px) {
  .admin-desktop-only { display: none; }
  .admin-mobile-only   { display: block; }
}

/* ── Users tab: mobile card list ── */
.admin-user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  border: 1.5px solid var(--border);
  background: var(--s2);
  cursor: pointer;
  text-align: left;
  width: 100%;
  font-family: 'Raleway', sans-serif;
  margin-bottom: 8px;
  transition: border-color .15s, background .15s;
}
.admin-user-card:hover {
  border-color: var(--border2);
  background: var(--s3);
}
.admin-user-card-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--s3);
  font-size: .7rem;
  font-weight: 800;
  color: var(--g2);
  overflow: hidden;
}
.admin-user-card-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.admin-user-card-body {
  flex: 1;
  min-width: 0;
}
.admin-user-card-name {
  font-size: .8rem;
  font-weight: 800;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.admin-user-card-email {
  font-size: .62rem;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.admin-user-card-sub {
  font-size: .62rem;
  color: var(--muted);
  margin-top: 3px;
}

/* ── Users tab: mobile drill-down detail view ── */
.admin-drilldown-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: .75rem;
  font-weight: 700;
  color: var(--g2);
  padding: 0 0 14px;
  font-family: 'Raleway', sans-serif;
}

/* ── Role select — shared between desktop detail panel and mobile drill-down ── */
.admin-role-select {
  font-size: .68rem;
  font-weight: 700;
  border: 1.5px solid var(--border2);
  border-radius: 8px;
  background: var(--s2);
  color: var(--text);
  padding: 6px 10px;
  cursor: pointer;
  font-family: 'Raleway', sans-serif;
}
.admin-role-select:disabled {
  opacity: .5;
  cursor: not-allowed;
}
.admin-role-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.admin-role-row-label {
  font-size: .62rem;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
}
```

- [ ] **Step 2: Replace `app/admin/UsersTab.jsx` entirely**

```jsx
'use client';

import { useState, useEffect } from 'react';

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

/** Role dropdown — reused in both the desktop side panel and the mobile drill-down. */
function RoleSelect({ user, sessionUserId, roleChanging, onChange }) {
  return (
    <div className="admin-role-row">
      <span className="admin-role-row-label">Role</span>
      <select
        className="admin-role-select"
        value={user.role}
        disabled={roleChanging === user.id || user.id === sessionUserId}
        onChange={e => onChange(user.id, e.target.value)}
      >
        <option value="client">client</option>
        <option value="distributor">distributor</option>
        <option value="admin">admin</option>
      </select>
    </div>
  );
}

/** CAS portfolio list — reused in both the desktop side panel and the mobile drill-down. */
function PortfolioList({ selectedUser, portfolios, portsLoading, deletingId, setDeletingId, deleteInFlight, deletePortfolio, notifying, notifyMsg, notifyClient }) {
  return (
    <>
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
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 12 }}>
            No CAS uploads yet
          </div>
          <a
            href={`/cas-tracker?userId=${selectedUser.id}&uname=${encodeURIComponent(selectedUser.name || selectedUser.email || '')}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-block', fontSize: '.65rem', fontWeight: 700,
              padding: '7px 14px', borderRadius: 7,
              background: 'var(--g1)', color: '#fff',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--g2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
          >
            View Manual Holdings →
          </a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {portfolios.map(p => (
            <div key={p.id} style={{
              padding: '10px 12px', borderRadius: 10,
              border: '1.5px solid var(--border)', background: 'var(--s2)',
            }}>
              {deletingId === p.id ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Delete "{p.file_name}"?
                  </span>
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                    <button onClick={() => deletePortfolio(p.id)} disabled={deleteInFlight}
                      style={{ fontSize: '.62rem', fontWeight: 800, color: '#fff', background: 'var(--neg)',
                        border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
                      {deleteInFlight ? '…' : 'Delete'}
                    </button>
                    <button onClick={() => setDeletingId('')} disabled={deleteInFlight}
                      style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted)', background: 'none',
                        border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
                      📄 {p.file_name}
                    </div>
                    <div style={{ fontSize: '.58rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {p.pan_count} PAN{p.pan_count !== 1 ? 's' : ''} · {fmtDate(p.uploaded_at)}
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0, alignItems:'flex-end' }}>
                    <div style={{ display:'flex', gap:5 }}>
                      <button onClick={e=>{e.stopPropagation();notifyClient(p);}} disabled={notifying===p.id}
                        style={{ fontSize:'.6rem', fontWeight:700, padding:'4px 9px', borderRadius:6,
                          border:'1.5px solid var(--border)', background:notifying===p.id?'var(--s3)':'var(--s2)',
                          color:'var(--g2)', cursor:notifying===p.id?'not-allowed':'pointer',
                          whiteSpace:'nowrap', fontFamily:'Raleway, sans-serif' }}>
                        {notifying===p.id?'…':'✉'}
                      </button>
                      <button onClick={e=>{e.stopPropagation();setDeletingId(p.id);}}
                        title="Delete this CAS upload"
                        style={{ fontSize:'.6rem', fontWeight:700, padding:'4px 9px', borderRadius:6,
                          border:'1.5px solid var(--border)', background:'var(--s2)',
                          color:'var(--muted)', cursor:'pointer',
                          whiteSpace:'nowrap', fontFamily:'Raleway, sans-serif' }}
                        onMouseEnter={e=>e.currentTarget.style.color='var(--neg)'}
                        onMouseLeave={e=>e.currentTarget.style.color='var(--muted)'}>
                        🗑
                      </button>
                      <a href={`/cas-tracker?load=${encodeURIComponent(p.blob_key)}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e=>e.stopPropagation()}
                        style={{ fontSize:'.65rem', fontWeight:700, padding:'5px 11px', borderRadius:6,
                          background:'var(--g1)', color:'#fff', textDecoration:'none', whiteSpace:'nowrap' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--g2)'}
                        onMouseLeave={e=>e.currentTarget.style.background='var(--g1)'}>
                        View →
                      </a>
                    </div>
                    {notifyMsg.id===p.id&&(
                      <div style={{ fontSize:'.58rem', fontWeight:700,
                        color:notifyMsg.type==='ok'?'var(--g1)':'var(--neg)' }}>
                        {notifyMsg.text}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function UsersTab({ session }) {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [portfolios, setPortfolios]     = useState([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [roleChanging, setRoleChanging] = useState('');
  const [notifying,    setNotifying]    = useState('');
  const [notifyMsg,    setNotifyMsg]    = useState({ id: '', type: '', text: '' });
  const [deletingId,     setDeletingId]     = useState('');
  const [deleteInFlight, setDeleteInFlight] = useState(false);

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

  function selectUserCard(user) {
    selectUser(user);
    setMobileDetailOpen(true);
  }

  function closeDesktopPanel() {
    setSelectedUser(null);
  }

  function closeMobileDrilldown() {
    setMobileDetailOpen(false);
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
      setSelectedUser(prev => prev && prev.id === userId ? { ...prev, role: newRole } : prev);
    } catch (e) { alert(e.message); }
    finally { setRoleChanging(''); }
  }

  async function notifyClient(portfolio) {
    setNotifying(portfolio.id);
    setNotifyMsg({ id: '', type: '', text: '' });
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id, email: selectedUser.email,
          name: selectedUser.name, fileName: portfolio.file_name,
          blobKey: portfolio.blob_key, panCount: portfolio.pan_count,
          uploadedAt: portfolio.uploaded_at,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to send');
      setNotifyMsg({ id: portfolio.id, type: 'ok', text: 'Sent ✓' });
    } catch (err) {
      setNotifyMsg({ id: portfolio.id, type: 'err', text: err.message });
    } finally { setNotifying(''); }
  }

  async function deletePortfolio(id) {
    setDeleteInFlight(true);
    try {
      const res = await fetch('/api/cas/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setPortfolios(prev => prev.filter(p => p.id !== id));
      }
    } catch { /* non-fatal — entry stays, admin can retry */ }
    setDeleteInFlight(false);
    setDeletingId('');
  }

  if (error) return <div className="error-box">⚠ {error}</div>;

  const detailProps = {
    selectedUser, portfolios, portsLoading, deletingId, setDeletingId,
    deleteInFlight, deletePortfolio, notifying, notifyMsg, notifyClient,
  };

  return (
    <>
      {/* ══ MOBILE / TABLET (<768px) ══ */}
      <div className="admin-mobile-only">
        {mobileDetailOpen && selectedUser ? (
          <div>
            <button className="admin-drilldown-back" onClick={closeMobileDrilldown}>
              ← Back to Users
            </button>
            <div className="table-card">
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text)' }}>
                  {selectedUser.name || selectedUser.email}
                </div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedUser.email}
                </div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                <RoleSelect
                  user={selectedUser}
                  sessionUserId={session.user.id}
                  roleChanging={roleChanging}
                  onChange={changeRole}
                />
                <PortfolioList {...detailProps} />
              </div>
            </div>
          </div>
        ) : (
          <div>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="sk" style={{ height: 62, borderRadius: 10, marginBottom: 8 }} />
              ))
            ) : users.map(u => (
              <button key={u.id} className="admin-user-card" onClick={() => selectUserCard(u)}>
                <div className="admin-user-card-avatar">
                  {u.image ? <img src={u.image} alt="" referrerPolicy="no-referrer" /> : (u.name || u.email || '?')[0].toUpperCase()}
                </div>
                <div className="admin-user-card-body">
                  <div className="admin-user-card-name">
                    {u.name || <em style={{ color: 'var(--muted)' }}>Pending</em>}
                    {u.id === session.user.id && <span style={{ fontSize: '.55rem', color: 'var(--muted)', marginLeft: 5 }}>(you)</span>}
                  </div>
                  <div className="admin-user-card-email">{u.email}</div>
                  <div className="admin-user-card-sub">{u.portfolio_count || 0} portfolio{u.portfolio_count === 1 ? '' : 's'} · joined {fmtDate(u.created_at)}</div>
                </div>
                <RoleBadge role={u.role} />
              </button>
            ))}
            <div className="src-text">Tap a user to view their CAS uploads and manage their role</div>
          </div>
        )}
      </div>

      {/* ══ DESKTOP (≥768px) ══ */}
      <div className="admin-desktop-only" style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 340px' : '1fr', gap: 20 }}>
        <div className="table-card">
          <div className="table-wrap">
            <table className="idx-table" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingLeft: 16 }}>User</th>
                  <th>Role</th>
                  <th>Portfolios</th>
                  <th>Last Upload</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[180, 60, 50, 80, 80].map((w, j) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="src-text">Click a row to view that user's CAS uploads and manage their role</div>
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
                <button onClick={closeDesktopPanel}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '.9rem', color: 'var(--muted)', padding: 4 }}>
                  ✕
                </button>
              </div>
            </div>
            <div style={{ padding: '12px 16px' }}>
              <RoleSelect
                user={selectedUser}
                sessionUserId={session.user.id}
                roleChanging={roleChanging}
                onChange={changeRole}
              />
              <PortfolioList {...detailProps} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify desktop behavior is unchanged**

Run: `npm run dev`, open `/admin` at a browser width ≥768px.

Expected: table (now 5 columns — Change Role column is gone), selecting a row opens the side panel, panel now shows a "Role" row with the dropdown above "CAS Portfolios", changing role there updates the badge in the table immediately (verifies the new `setSelectedUser` sync in `changeRole`), CAS delete/notify/view still work exactly as before.

- [ ] **Step 4: Verify mobile behavior**

In the browser dev tools, switch to a mobile viewport (e.g. 375px wide, or resize below 768px).

Expected: table is replaced by a stacked card list (avatar, name, email, role badge, "N portfolios · joined DATE"). Tapping a card opens the drill-down (card list replaced by a "← Back to Users" button + detail view with Role row + CAS Portfolios list). Changing role in the drill-down works. Clicking "← Back to Users" returns to the card list. Resize back above 768px — desktop view should show correctly with `selectedUser` state preserved (side panel opens if a user was previously selected).

- [ ] **Step 5: Commit**

```bash
git add app/admin/UsersTab.jsx app/admin/admin.css
git commit -m "feat(admin): responsive Users tab — cards + drill-down on mobile, consolidated role management

Desktop (>=768px): table + side panel, unchanged in structure. The
Change Role table column is removed — role management moves into the
detail panel (both desktop side panel and the new mobile drill-down),
so it exists in exactly one place instead of being a column that can't
fit on narrow screens.

Mobile/tablet (<768px): the table becomes a stacked card list (avatar,
name, email, role badge, portfolio count). Tapping a card drills down
into a full-width detail view with a back button, matching the
wireframes approved during brainstorming. Both representations are
rendered in JSX and toggled via a CSS media query (.admin-desktop-only
/ .admin-mobile-only), not a JS viewport hook — no resize listeners, no
hydration-mismatch risk."
```

---

## Task 3: Add Client tab — MF Central `.xlsx` support + polish

**Files:**
- Modify: `app/admin/AddClientTab.jsx` (entire file — replace)
- Modify: `app/admin/admin.css` (append new class)
- Test: manual (upload both a `.pdf` and a `.xlsx` through this tab)

**Interfaces:**
- Consumes: `/api/parse-mfcentral` (already shipped, see `app/api/parse-mfcentral/route.js`) — POST, `multipart/form-data` with a `file` field, no password field. Returns the same JSON shape as `/api/parse` on success (`{ folios, investor_info, pan_investor_map }`), or `{ error: string }` with a non-2xx status on failure.
- Produces: no new exports — self-contained.

- [ ] **Step 1: Append one CSS class to `app/admin/admin.css`** (small note/help text style, reused for the format hint under the file input)

```css

.admin-upload-hint {
  font-size: .6rem;
  color: var(--muted);
  margin-top: 4px;
  line-height: 1.5;
}
```

- [ ] **Step 2: Replace `app/admin/AddClientTab.jsx` entirely**

```jsx
'use client';

import { useState } from 'react';

export default function AddClientTab() {
  const [email, setEmail]       = useState('');
  const [name, setName]         = useState('');
  const [step, setStep]         = useState('form'); // form | uploading | done | error
  const [msg, setMsg]           = useState('');
  const [userId, setUserId]     = useState('');
  const [casFile, setCasFile]   = useState(null);
  const [password, setPassword] = useState('');
  const [parsing, setParsing]   = useState(false);

  const isMfCentral = (casFile?.name || '').toLowerCase().endsWith('.xlsx');

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
    if (!casFile || !userId) return;
    setParsing(true);
    setMsg(isMfCentral ? 'Parsing MF Central report…' : 'Parsing CAS…');
    try {
      const formData = new FormData();
      formData.append('file', casFile);
      if (!isMfCentral) formData.append('password', password);
      const parseRes = await fetch(isMfCentral ? '/api/parse-mfcentral' : '/api/parse', {
        method: 'POST', body: formData,
      });
      if (!parseRes.ok) {
        const err = await parseRes.json().catch(() => ({}));
        throw new Error(
          err.error || err.detail || (parseRes.status === 401 ? 'Incorrect password' : 'Parse failed')
        );
      }
      const data = await parseRes.json();
      setMsg('Saving portfolio…');
      const panCount = new Set(
        (data.folios || []).map(f => (f.PAN || '').toUpperCase().trim()).filter(p => p.length === 10)
      ).size;
      const saveRes = await fetch('/api/cas/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsedData: data, fileName: casFile.name, panCount, targetUserId: userId }),
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
    setUserId(''); setCasFile(null); setPassword('');
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
                  <div className="field-label">CAS PDF or MF Central Excel Report</div>
                  <input type="file" accept=".pdf,.xlsx" required
                    className="file-input"
                    onChange={e => setCasFile(e.target.files[0])} />
                  <div className="admin-upload-hint">
                    CAMS/KFintech: upload the password-protected .pdf. MF Central: upload the "Detailed Report" .xlsx — no password needed.
                  </div>
                </div>
                {!isMfCentral && (
                  <div style={{ marginBottom: 16 }}>
                    <div className="field-label">PDF Password</div>
                    <input type="password" value={password} required={!isMfCentral}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter PDF password"
                      className="field-input" />
                  </div>
                )}
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
```

- [ ] **Step 3: Verify the `.pdf` flow is unchanged**

Run: `npm run dev`, go to `/admin` → Add Client tab. Create/find a test client, upload a real CAS `.pdf` with its password.

Expected: identical to before — password field shows, required, upload succeeds, portfolio saves.

- [ ] **Step 4: Verify the new `.xlsx` flow**

In the same tab, click "Add another client", create/find a (different or same) test client, select an MF Central `.xlsx` report (e.g. the sample file used earlier this session, `Gunjan_singhal_cas_detailed_report_2026_07_13_213837.xlsx` if still available locally, or any real MF Central detailed report).

Expected: as soon as the `.xlsx` is selected, the Password field disappears (verifies `isMfCentral` derived state and the `required={!isMfCentral}` / conditional render). Submitting calls `/api/parse-mfcentral` (verify in Network tab), parses successfully, and saves via `/api/cas/save` exactly as the `.pdf` path does.

- [ ] **Step 5: Verify error handling for both formats**

Try an incorrect PDF password → expect "Incorrect password" error shown inline (not a crash). Try a `.xlsx` file that isn't an MF Central report (e.g. an unrelated spreadsheet) → expect the friendly error from `/api/parse-mfcentral` ("This does not look like an MF Central detailed report…") to display via `err.error` in the caught exception.

- [ ] **Step 6: Commit**

```bash
git add app/admin/AddClientTab.jsx app/admin/admin.css
git commit -m "feat(admin): Add Client tab accepts MF Central .xlsx alongside CAMS/KFintech .pdf

Same extension-detection pattern already used in app/cas-tracker/page.js:
.xlsx skips the password field and routes to the already-shipped
/api/parse-mfcentral instead of /api/parse. No backend changes — this
is purely wiring the existing route into the admin-on-behalf-of-client
upload flow."
```

---

## Task 4: Manual Holdings tab — responsive form/cards + inline delete confirm

**Files:**
- Modify: `app/admin/ManualHoldingsTab.jsx` (entire file — replace)
- Modify: `app/admin/admin.css` (append new classes)
- Test: manual (dev server, resize across 640px and 768px breakpoints, add/edit/delete a holding)

**Interfaces:**
- Consumes: `.admin-desktop-only` / `.admin-mobile-only` classes defined in Task 2 — reused here for the same table→card toggle pattern.
- Produces: no new exports — self-contained.

- [ ] **Step 1: Append the new CSS classes to `app/admin/admin.css`**

```css

/* ── Manual Holdings tab: responsive form ── */
.admin-holding-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}

@media (max-width: 640px) {
  .admin-holding-form-grid {
    /* Single column — the inline gridColumn:'1/-1' on Fund Name/SIF
       Scheme/Notes becomes a no-op here (a 1-column grid is already
       full-width for every child), so no extra override rule is needed. */
    grid-template-columns: 1fr;
  }
}

/* ── Manual Holdings tab: mobile card list ── */
.admin-holding-card {
  padding: 12px;
  border-radius: 10px;
  border: 1.5px solid var(--border);
  background: var(--s2);
  margin-bottom: 8px;
}
.admin-holding-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.admin-holding-card-name {
  font-size: .78rem;
  font-weight: 700;
  color: var(--text);
}
.admin-holding-card-notes {
  font-size: .6rem;
  color: var(--muted);
  margin-top: 2px;
}
.admin-holding-card-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  margin-bottom: 10px;
}
.admin-holding-metric-label {
  font-size: .55rem;
  font-weight: 700;
  letter-spacing: .5px;
  text-transform: uppercase;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
}
.admin-holding-metric-value {
  font-size: .72rem;
  font-weight: 700;
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
  margin-top: 1px;
}
.admin-holding-card-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

/* ── Inline two-step delete confirm — reused wherever this pattern applies ── */
.admin-inline-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.admin-inline-confirm-text {
  font-size: .68rem;
  font-weight: 600;
  color: var(--text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.admin-inline-confirm-actions {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
}
.admin-inline-confirm-delete {
  font-size: .62rem;
  font-weight: 800;
  color: #fff;
  background: var(--neg);
  border: none;
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
}
.admin-inline-confirm-cancel {
  font-size: .62rem;
  font-weight: 700;
  color: var(--muted);
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 10px;
  cursor: pointer;
}
```

- [ ] **Step 2: Replace `app/admin/ManualHoldingsTab.jsx` entirely**

```jsx
'use client';

import { useState, useEffect } from 'react';

const FUND_TYPES = ['Equity MF', 'Debt MF', 'Hybrid MF', 'Index Fund / ETF', 'SIF', 'Other'];

function HoldingRow({ h, i, navMap, openEdit, deletingId, setDeletingId, deleteInFlight, confirmDelete }) {
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
    <tr>
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
        {deletingId === h.id ? (
          <div className="admin-inline-confirm">
            <span className="admin-inline-confirm-text">Delete?</span>
            <div className="admin-inline-confirm-actions">
              <button className="admin-inline-confirm-delete" disabled={deleteInFlight} onClick={() => confirmDelete(h.id)}>
                {deleteInFlight ? '…' : 'Yes'}
              </button>
              <button className="admin-inline-confirm-cancel" disabled={deleteInFlight} onClick={() => setDeletingId('')}>
                No
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            <button onClick={() => openEdit(i)}
              style={{
                padding: '3px 10px', borderRadius: 6, border: '1.5px solid var(--border)',
                background: 'var(--s2)', cursor: 'pointer', fontSize: '.65rem',
                fontWeight: 700, color: 'var(--g2)', fontFamily: 'Raleway, sans-serif',
              }}>
              Edit
            </button>
            <button onClick={() => setDeletingId(h.id)}
              style={{
                padding: '3px 10px', borderRadius: 6, border: '1.5px solid #ffcdd2',
                background: 'var(--neg-bg)', cursor: 'pointer', fontSize: '.65rem',
                fontWeight: 700, color: 'var(--neg)', fontFamily: 'Raleway, sans-serif',
              }}>
              Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function HoldingCard({ h, i, navMap, openEdit, deletingId, setDeletingId, deleteInFlight, confirmDelete }) {
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
    <div className="admin-holding-card">
      <div className="admin-holding-card-head">
        <div style={{ minWidth: 0 }}>
          <div className="admin-holding-card-name">{h.fund_name}</div>
          {h.notes && <div className="admin-holding-card-notes">{h.notes}</div>}
        </div>
        <span style={{
          fontSize: '.52rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
          background: h.fund_type === 'SIF' ? '#e0f2f1' : 'var(--s3)',
          color: h.fund_type === 'SIF' ? '#00695c' : 'var(--muted)',
          border: '1px solid var(--border)', fontFamily: "'JetBrains Mono', monospace",
        }}>
          {h.fund_type}
        </span>
      </div>

      <div className="admin-holding-card-metrics">
        <div>
          <div className="admin-holding-metric-label">Units</div>
          <div className="admin-holding-metric-value">{units.toFixed(4)}</div>
        </div>
        <div>
          <div className="admin-holding-metric-label">Purchase NAV</div>
          <div className="admin-holding-metric-value">₹{purchaseNav.toFixed(4)}</div>
        </div>
        <div>
          <div className="admin-holding-metric-label">Current NAV</div>
          <div className="admin-holding-metric-value">
            {hasLive ? <>₹{liveNav.toFixed(4)} <span style={{ color: 'var(--g1)' }}>●</span></> : '—'}
          </div>
        </div>
        <div>
          <div className="admin-holding-metric-label">Current Value</div>
          <div className="admin-holding-metric-value">
            ₹{Math.round(currentVal).toLocaleString('en-IN')}
            {!hasLive && <span style={{ fontWeight: 400, color: 'var(--muted)' }}> est.</span>}
          </div>
        </div>
        <div>
          <div className="admin-holding-metric-label">Gain / Loss</div>
          <div className="admin-holding-metric-value" style={{ color: isProfit ? 'var(--pos)' : 'var(--neg)' }}>
            {isProfit ? '+' : ''}{gainPct}%
          </div>
        </div>
      </div>

      {deletingId === h.id ? (
        <div className="admin-inline-confirm">
          <span className="admin-inline-confirm-text">Delete this holding?</span>
          <div className="admin-inline-confirm-actions">
            <button className="admin-inline-confirm-delete" disabled={deleteInFlight} onClick={() => confirmDelete(h.id)}>
              {deleteInFlight ? '…' : 'Yes'}
            </button>
            <button className="admin-inline-confirm-cancel" disabled={deleteInFlight} onClick={() => setDeletingId('')}>
              No
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-holding-card-actions">
          <button onClick={() => openEdit(i)}
            style={{
              padding: '4px 12px', borderRadius: 6, border: '1.5px solid var(--border)',
              background: 'var(--s3)', cursor: 'pointer', fontSize: '.65rem',
              fontWeight: 700, color: 'var(--g2)', fontFamily: 'Raleway, sans-serif',
            }}>
            Edit
          </button>
          <button onClick={() => setDeletingId(h.id)}
            style={{
              padding: '4px 12px', borderRadius: 6, border: '1.5px solid #ffcdd2',
              background: 'var(--neg-bg)', cursor: 'pointer', fontSize: '.65rem',
              fontWeight: 700, color: 'var(--neg)', fontFamily: 'Raleway, sans-serif',
            }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [deletingId, setDeletingId]         = useState('');
  const [deleteInFlight, setDeleteInFlight] = useState(false);
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

  async function confirmDelete(id) {
    setDeleteInFlight(true);
    try {
      const res = await fetch(`/api/admin/holdings?id=${id}&userId=${selUserId}`, { method: 'DELETE' });
      if (res.ok) {
        setHoldings(prev => prev.filter(h => h.id !== id));
      } else {
        setMsg({ type: 'err', text: 'Delete failed' });
      }
    } catch {
      setMsg({ type: 'err', text: 'Delete failed' });
    }
    setDeleteInFlight(false);
    setDeletingId('');
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
            <div className="admin-holding-form-grid">

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

      {/* ── Holdings: desktop table ─────────────────────────────────────── */}
      {selUserId && !loading && holdings.length > 0 && (
        <div className="admin-desktop-only table-card">
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
                {holdings.map((h, i) => (
                  <HoldingRow
                    key={h.id} h={h} i={i} navMap={navMap} openEdit={openEdit}
                    deletingId={deletingId} setDeletingId={setDeletingId}
                    deleteInFlight={deleteInFlight} confirmDelete={confirmDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="src-text">
            Current NAV: SIF from AMFI · MF from mfapi.in · Live indicator ● = NAV fetched
          </div>
        </div>
      )}

      {/* ── Holdings: mobile/tablet cards ───────────────────────────────── */}
      {selUserId && !loading && holdings.length > 0 && (
        <div className="admin-mobile-only">
          {holdings.map((h, i) => (
            <HoldingCard
              key={h.id} h={h} i={i} navMap={navMap} openEdit={openEdit}
              deletingId={deletingId} setDeletingId={setDeletingId}
              deleteInFlight={deleteInFlight} confirmDelete={confirmDelete}
            />
          ))}
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
```

- [ ] **Step 3: Verify desktop behavior**

Run: `npm run dev`, open `/admin` → Manual Holdings tab at width ≥768px, select a client with existing holdings (or add one).

Expected: table renders as before. Clicking "Delete" on a row now shows the inline "Delete? [Yes] [No]" confirm in place of the Edit/Delete buttons — no browser `confirm()` popup. Clicking "Yes" removes the row; "No" reverts to Edit/Delete. Add/Edit form still works, unchanged at this width (2-column grid).

- [ ] **Step 4: Verify tablet/mobile form collapse**

Resize below 640px, click "+ Add Holding".

Expected: the form's fields stack into a single column (Fund Type, Fund Name, Units, Purchase NAV, etc. each full-width) — verify by checking that `gridColumn: '1/-1'` fields (Fund Name, Notes) and the two-per-row fields all end up one-per-row. Between 640–768px, form should still show 2 columns (per the spec's intentional breakpoint difference from the table).

- [ ] **Step 5: Verify mobile/tablet holdings cards**

Resize below 768px with a client that has holdings.

Expected: table is replaced by stacked cards — fund name + type badge at top, a 2-column metrics grid (Units/Purchase NAV/Current NAV/Current Value/Gain-Loss), Edit/Delete buttons at the bottom. Delete shows the same inline confirm pattern as desktop. Resize back to ≥768px — table view returns correctly.

- [ ] **Step 6: Commit**

```bash
git add app/admin/ManualHoldingsTab.jsx app/admin/admin.css
git commit -m "feat(admin): responsive Manual Holdings tab — form collapse, cards, inline delete confirm

Add/edit form's 2-column grid collapses to one column below 640px
(tablet keeps 2 columns — a form row is still comfortable at that
width, unlike the data table). Holdings table gets the same
desktop-table/mobile-cards CSS-toggle treatment as the Users tab from
the previous task, at the 768px breakpoint. Holding delete replaces
confirm()/alert() with the same inline two-step confirm pattern used
everywhere else on this page (CAS delete, PAN rename)."
```

---

## Final Verification (after all four tasks)

- [ ] Full manual pass across all three tabs at three widths: 375px (phone), 700px (tablet), 1200px (desktop). Confirm no horizontal overflow anywhere, no overlapping elements, all interactive elements are comfortably tappable on mobile (buttons/cards not so small they're hard to hit).
- [ ] `npm run build` completes cleanly.
- [ ] Confirm `git status` shows a clean tree — all four tasks committed, no leftover uncommitted changes.
