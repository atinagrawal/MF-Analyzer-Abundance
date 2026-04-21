'use client';

/**
 * app/admin/page.jsx — Admin Panel
 *
 * Shows all users, their roles, portfolio upload counts.
 * Allows role promotion/demotion.
 * Clicking a user row loads their CAS portfolios via /api/cas/list?userId=xxx
 *
 * Access: admin role only. Middleware ensures session exists;
 * this page enforces the admin role client-side (API also enforces server-side).
 */

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar  from '@/components/Navbar';
import Footer  from '@/components/Footer';

const ROLE_STYLES = {
  admin:       { background: '#fff3e0', color: '#e65100', border: '#ffe0b2' },
  distributor: { background: '#e8f5e9', color: '#1b5e20', border: '#c8e6c9' },
  client:      { background: 'var(--s2)', color: 'var(--muted)', border: 'var(--border)' },
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

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [selectedUser, setSelectedUser] = useState(null);  // { id, name, email }
  const [portfolios, setPortfolios]     = useState([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [roleChanging, setRoleChanging] = useState('');   // userId being updated

  // Redirect if not admin
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?from=/admin');
    if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.replace('/');
    }
  }, [status, session, router]);

  // Load users
  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'admin') return;
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setUsers(d.users);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, session]);

  // Load portfolios for selected user
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

  // Change role
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
    } catch (e) {
      alert(e.message);
    } finally {
      setRoleChanging('');
    }
  }

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
          <h1 className="page-title">User <span>Management</span></h1>
          <p className="page-subtitle">
            {users.length} registered users · Manage roles and view CAS uploads
          </p>
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 20 }}>⚠ {error}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 340px' : '1fr', gap: 20 }}>

          {/* ── Users table ── */}
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
                          <td key={j}>
                            <div className="sk" style={{ width: w, height: 13 }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : users.map(u => (
                    <tr
                      key={u.id}
                      onClick={() => selectUser(u)}
                      style={{
                        cursor: 'pointer',
                        background: selectedUser?.id === u.id ? 'var(--g-xlight)' : undefined,
                      }}
                    >
                      {/* User */}
                      <td style={{ textAlign: 'left', paddingLeft: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          {u.image ? (
                            <img
                              src={u.image} alt="" width={26} height={26}
                              style={{ borderRadius: '50%', flexShrink: 0 }}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div style={{
                              width: 26, height: 26, borderRadius: '50%',
                              background: 'var(--s3)', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              fontSize: '.6rem', fontWeight: 800, color: 'var(--g2)',
                            }}>
                              {(u.name || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text)' }}>
                              {u.name || '—'}
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

                      {/* Role */}
                      <td style={{ textAlign: 'center' }}>
                        <RoleBadge role={u.role} />
                      </td>

                      {/* Portfolio count */}
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
                        {u.portfolio_count || 0}
                      </td>

                      {/* Last upload */}
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '.65rem' }}>
                        {fmtDate(u.last_upload)}
                      </td>

                      {/* Joined */}
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '.65rem' }}>
                        {fmtDate(u.created_at)}
                      </td>

                      {/* Role change */}
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
            <div className="src-text">
              Click a row to view that user's CAS uploads
            </div>
          </div>

          {/* ── Selected user portfolios ── */}
          {selectedUser && (
            <div className="table-card" style={{ height: 'fit-content' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text)' }}>
                      {selectedUser.name}
                    </div>
                    <div style={{ fontSize: '.6rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {selectedUser.email}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedUser(null)}
                    style={{
                      border: 'none', background: 'none', cursor: 'pointer',
                      fontSize: '.9rem', color: 'var(--muted)', padding: 4,
                    }}
                  >
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
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 8,
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
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{
                            flexShrink: 0, fontSize: '.65rem', fontWeight: 700,
                            padding: '5px 11px', borderRadius: 6,
                            background: 'var(--g1)', color: '#fff',
                            textDecoration: 'none', whiteSpace: 'nowrap',
                          }}
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
      </div>

      <Footer />
    </>
  );
}
