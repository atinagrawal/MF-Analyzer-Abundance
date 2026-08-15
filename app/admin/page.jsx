'use client';

/**
 * app/admin/page.jsx — Admin Panel
 *
 * Open to both 'admin' and 'distributor' roles, but a distributor sees a
 * scoped, read-only slice: UsersTab lists only their own assigned clients
 * (see app/api/admin/users/route.js) with role/plan/distributor controls
 * hidden, and the Manual Holdings tab — which operates on ANY user with no
 * distributor-scoping of its own — is admin-only.
 *
 * Three tabs (each its own file):
 *   1. UsersTab           — list, role management (admin only), view/delete CAS uploads
 *   2. AddClientTab        — create pending user by email, upload CAS on their behalf
 *   3. ManualHoldingsTab   — add/edit manual MF or SIF holdings for any user (admin only)
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

const ALLOWED_ROLES = ['admin', 'distributor'];

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState('users');

  const role = session?.user?.role;
  const isAllowed = ALLOWED_ROLES.includes(role);
  const isAdmin = role === 'admin';

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?from=/admin');
    if (status === 'authenticated' && !isAllowed) router.replace('/');
  }, [status, isAllowed, router]);

  // Positive check, not "loading or forbidden": status can also be
  // 'unauthenticated' (session === null) for the render or two before the
  // redirect effect above actually navigates away, and UsersTab dereferences
  // session.user directly — rendering it with a null session crashes.
  if (status !== 'authenticated' || !session || !isAllowed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sk" style={{ width: 120, height: 16, borderRadius: 8 }} />
      </div>
    );
  }

  const tabs = [
    { key: 'users',     label: '👥 Users' },
    { key: 'addclient', label: '➕ Add Client' },
    ...(isAdmin ? [{ key: 'holdings', label: '📋 Manual Holdings' }] : []),
  ];

  return (
    <>
      <div className="container">
        <Navbar />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot" />
            <span className="eyebrow-text">{isAdmin ? 'Admin Panel' : 'My Clients'}</span>
          </div>
          <h1 className="page-title">Distributor <span>Dashboard</span></h1>
        </div>

        <div className="admin-tab-bar">
          {tabs.map(t => (
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
        {tab === 'holdings'  && isAdmin && <ManualHoldingsTab />}
      </div>
      <Footer />
    </>
  );
}
