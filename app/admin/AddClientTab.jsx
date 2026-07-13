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
