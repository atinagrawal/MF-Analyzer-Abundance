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
