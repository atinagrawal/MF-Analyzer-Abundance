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
