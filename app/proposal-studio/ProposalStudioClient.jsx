'use client';

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import { startCheckout } from '@/lib/checkoutClient';
import { getMFLogoFromSchemeName } from '@/lib/providerLogos';
import { PROPOSAL_STUDIO_FAQ } from '@/lib/proposalStudioFaq';
import { formatProposalId, useMCapIndex, CollapsibleSection, ProposalAnalysisBlock } from './ProposalSections';
import { useSearchParams } from 'next/navigation';
import ShareControls from './ShareControls';

export default function ProposalStudioClient() {
  const { data: session, status } = useSession();
  const isAuthed = status === 'authenticated';
  const isPro = session?.user?.plan === 'pro';

  return (
    <>
      <Navbar activePage="proposal-studio" />
      <main className="pfc-page">
        <h1 className="pfc-title">Proposal Studio</h1>
        <p className="pfc-subtitle">Combine funds to see overlap, exposure, and scheme details in one view.</p>

        <PfcExplainer />

        {status !== 'loading' && !isAuthed && <PfcSignInGate />}
        {status !== 'loading' && isAuthed && !isPro && <PfcProGate session={session} />}
        {isAuthed && isPro && (
          <Suspense fallback={<div className="pfc-hint">Loading…</div>}>
            <ProposalStudioTool />
          </Suspense>
        )}

        <PfcFaq />
      </main>
      <Footer />
    </>
  );
}

function PfcExplainer() {
  return (
    <section className="pfc-explainer">
      <p>
        Proposal Studio combines the mutual funds and SIFs you choose — either your real
        holdings imported from a CAS statement, or a new investment plan you're building —
        into a single combined view: how your money is spread across asset classes and
        sectors, which holdings — stocks, bonds, gold or other ETFs — show up in more than
        one fund (overlap), and how much sits in Large, Mid, and Small-cap companies.
      </p>
      <ul className="pfc-explainer-list">
        <li>Combined asset allocation and sector exposure across every fund you add</li>
        <li>Security-level exposure, with a full-holdings view beyond just the top 10</li>
        <li>Pairwise fund overlap — how much of every named holding (stocks, bonds, gold/other ETFs) is duplicated between funds</li>
        <li>M-Cap allocation using AMFI's official Large/Mid/Small-cap categorization</li>
        <li>Works for a Lumpsum or a SIP proposal, with mutual funds and SIFs both supported</li>
      </ul>
    </section>
  );
}

function PfcFaq() {
  return (
    <section className="pfc-faq">
      <h2 className="pfc-faq-title">Frequently Asked Questions</h2>
      {PROPOSAL_STUDIO_FAQ.map((f) => (
        <PfcFaqItem key={f.q} q={f.q} a={f.a} />
      ))}
    </section>
  );
}

// Deliberately does NOT reuse CollapsibleSection: that component conditionally
// *mounts* its body ({open && <div>...}), so a closed FAQ item's answer text
// never reaches the DOM at all -- invisible to crawlers even though the page
// is otherwise indexable, and inconsistent with the FAQPage JSON-LD (layout.js)
// which does carry the full answer text. This keeps the answer always in the
// DOM and only toggles visibility, matching app/pms-screener/page.jsx's
// existing `hidden={!open}` FAQ pattern.
function PfcFaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pfc-faq-item">
      <button className="pfc-section-header" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <h3 className="pfc-faq-q">{q}</h3>
        <span className={`pfc-chevron ${open ? 'pfc-chevron-open' : ''}`}>▾</span>
      </button>
      <div className="pfc-faq-a" hidden={!open}>
        <p>{a}</p>
      </div>
    </div>
  );
}

function PfcSignInGate() {
  return (
    <div className="brd-gate">
      <div className="brd-gate-lock">🔒</div>
      <h2 className="brd-gate-title">Sign in to use Proposal Studio</h2>
      <p className="brd-gate-desc">
        Select multiple mutual funds and see combined sector/security exposure, fund overlap,
        and M-Cap allocation — everything a real investment proposal covers.
      </p>
      <div className="brd-gate-actions">
        <button className="brd-gate-btn" onClick={() => signIn()}>Sign in to continue →</button>
      </div>
    </div>
  );
}

function PfcProGate({ session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpgrade() {
    setLoading(true);
    setError('');
    try {
      await startCheckout({
        plan: 'annual',
        session,
        onSuccess() { window.location.reload(); },
        onDismiss() { setLoading(false); },
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="brd-gate">
      <div className="brd-gate-lock">⭐</div>
      <h2 className="brd-gate-title">Proposal Studio is a Pro feature</h2>
      <p className="brd-gate-desc">
        Select multiple mutual funds and see combined sector/security exposure, fund overlap
        detection, and M-Cap allocation — everything a real investment proposal covers, in
        one view.
      </p>
      <div className="brd-gate-pricing">
        <span className="brd-gate-amount">₹499</span>
        <span className="brd-gate-period">/yr + 18% GST</span>
        <span className="brd-gate-total">· Total ₹588.82</span>
      </div>
      <div className="brd-gate-actions">
        <button className="brd-gate-btn brd-gate-btn-pro" onClick={handleUpgrade} disabled={loading}>
          {loading ? 'Opening checkout…' : 'Upgrade to Pro →'}
        </button>
        <a className="brd-gate-faq" href="/pricing">See all Pro features · Lifetime plan available</a>
      </div>
      {error && <p className="brd-gate-error">{error}</p>}
    </div>
  );
}

// Some data sources (CAS registrar exports especially) render scheme names
// in ALL CAPS, which looks visually jarring sitting next to a normally-cased
// name from another source in the same table or PDF (e.g. "BANDHAN SMALL CAP
// FUND - REGULAR PLAN GROWTH" next to "HDFC Defence Fund - Growth Option").
// Only touches a string that is ENTIRELY uppercase -- a strong signal it's a
// formatting artifact rather than a deliberately-capitalized name -- so an
// already well-formatted name (including one that legitimately keeps just
// its AMC name in caps, e.g. "BANK OF INDIA Flexi Cap Fund") is never
// touched at all.
const SCHEME_NAME_ACRONYMS = new Set(['SBI', 'ICICI', 'HDFC', 'LIC', 'UTI', 'ITI', 'JM', 'DSP', 'PGIM', 'PPFAS', 'HSBC', 'ESG', 'IDCW', 'ELSS', 'SIP', 'NFO', 'NJ', 'BOI', 'PNB', 'IDBI', 'IDFC', 'ETF', 'FOF', 'FMP', 'PSU', 'NAV', 'AMC']);
const SCHEME_NAME_LOWERCASE_WORDS = new Set(['of', 'and', 'the', 'in', 'for', 'to', 'a', 'an', '&']);
function prettifySchemeName(name) {
  const s = String(name || '');
  if (!s || !/[A-Z]/.test(s) || s !== s.toUpperCase()) return s;
  return s.replace(/[A-Za-z']+/g, (word) => {
    const upper = word.toUpperCase();
    if (SCHEME_NAME_ACRONYMS.has(upper)) return upper;
    const lower = word.toLowerCase();
    if (SCHEME_NAME_LOWERCASE_WORDS.has(lower)) return lower;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function ClientDetailsCard({ clientName, setClientName, clientEmail, setClientEmail, clientPhone, setClientPhone, onTouched }) {
  const handleChange = (setter) => (e) => { onTouched(); setter(e.target.value); };
  return (
    <section className="pfc-client-details">
      <h3>Client Details</h3>
      <div className="pfc-client-fields">
        <input className="pfc-client-input" placeholder="Client name" value={clientName} onChange={handleChange(setClientName)} />
        <input className="pfc-client-input" type="email" placeholder="Client email" value={clientEmail} onChange={handleChange(setClientEmail)} />
        <input className="pfc-client-input" type="tel" placeholder="Client phone" value={clientPhone} onChange={handleChange(setClientPhone)} />
      </div>
    </section>
  );
}

// Editable so any distributor can use this tool for their own clients --
// prints on the proposal in place of a hardcoded name/ARN. Abundance's own
// branding (the running header, and the cover's "Powered by" mark) isn't
// touched by these fields, so the platform stays attributed regardless of
// who fills them in.
function AdvisorDetailsCard({ advisorName, setAdvisorName, advisorPhone, setAdvisorPhone, advisorEmail, setAdvisorEmail, advisorArn, setAdvisorArn, advisorEuin, setAdvisorEuin, onTouched }) {
  const handleChange = (setter) => (e) => { onTouched(); setter(e.target.value); };
  return (
    <section className="pfc-client-details">
      <h3>Prepared By (Your Details)</h3>
      <div className="pfc-client-fields">
        <input className="pfc-client-input" placeholder="Your name" value={advisorName} onChange={handleChange(setAdvisorName)} />
        <input className="pfc-client-input" type="tel" placeholder="Your phone" value={advisorPhone} onChange={handleChange(setAdvisorPhone)} />
        <input className="pfc-client-input" type="email" placeholder="Your email" value={advisorEmail} onChange={handleChange(setAdvisorEmail)} />
        <input className="pfc-client-input" placeholder="ARN number" value={advisorArn} onChange={handleChange(setAdvisorArn)} />
        <input className="pfc-client-input" placeholder="EUIN" value={advisorEuin} onChange={handleChange(setAdvisorEuin)} />
      </div>
    </section>
  );
}

// Inline collapsible list of the signed-in user's previously saved proposals,
// with client-side search (list can grow large over time -- searching beats
// scrolling) and a per-row two-step delete confirm, matching the inline
// confirm pattern already used for saved CAS portfolios
// (app/cas-tracker/page.js's deletingId state) rather than a native confirm().
function SavedProposalsSection({ onLoad, refreshKey }) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [deleteInFlight, setDeleteInFlight] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/proposal-studio/list')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setProposals(d.proposals || []); })
      .catch(() => { if (!cancelled) setError('Failed to load saved proposals.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  async function handleDelete(id) {
    setDeleteInFlight(true);
    setError('');
    try {
      const res = await fetch('/api/proposal-studio/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed.');
      setProposals((prev) => prev.filter((p) => p.id !== id));
      setDeletingId('');
    } catch (err) {
      setError(err.message);
    }
    setDeleteInFlight(false);
  }

  const filtered = proposals.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (p.client_name || '').toLowerCase().includes(q) || formatProposalId(p.id).toLowerCase().includes(q);
  });

  return (
    <CollapsibleSection title={`My Saved Proposals${proposals.length ? ` (${proposals.length})` : ''}`} defaultOpen={false}>
      {loading && <div className="pfc-hint">Loading saved proposals…</div>}
      {!loading && proposals.length === 0 && <div className="pfc-hint">No saved proposals yet. Build one below and click "Save Proposal" once you're done.</div>}
      {!loading && proposals.length > 0 && (
        <>
          <input
            className="pfc-search-input"
            placeholder="Search by client name or Proposal ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="pfc-saved-list">
            {filtered.map((p) => (
              <div className="pfc-saved-item" key={p.id}>
                {deletingId === p.id ? (
                  <div className="pfc-saved-confirm">
                    <span>Delete this proposal? This can't be undone.</span>
                    <div className="pfc-saved-confirm-actions">
                      <button className="pfc-saved-delete-confirm" disabled={deleteInFlight} onClick={() => handleDelete(p.id)}>
                        {deleteInFlight ? '…' : 'Delete'}
                      </button>
                      <button className="pfc-saved-delete-cancel" disabled={deleteInFlight} onClick={() => setDeletingId('')}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button className="pfc-saved-main" onClick={() => onLoad(p.id)}>
                      <span className="pfc-saved-id">{formatProposalId(p.id)}</span>
                      <span className="pfc-saved-name">{p.client_name || 'Unnamed client'}</span>
                      <span className="pfc-saved-meta">
                        {p.proposal_type === 'sip' ? 'SIP' : 'Lumpsum'} · ₹{Number(p.total_amount).toLocaleString('en-IN')} · {p.fund_count} fund{p.fund_count === 1 ? '' : 's'} · {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </button>
                    <a className="pfc-saved-view" href={`/proposal-studio/mine/${p.id}`}>View</a>
                    <button className="pfc-saved-delete" onClick={() => setDeletingId(p.id)}>Delete</button>
                  </>
                )}
              </div>
            ))}
            {filtered.length === 0 && <div className="pfc-hint">No proposals match "{query}".</div>}
          </div>
        </>
      )}
      {error && <div className="pfc-error-hint">{error}</div>}
    </CollapsibleSection>
  );
}

function ProposalStudioTool() {
  const { data: session } = useSession();
  const [selectedFunds, setSelectedFunds] = useState([]); // [{amfiCode, schemeName, amount, source: 'cas'|'manual', amountTouched}]
  const [casFunds, setCasFunds] = useState([]);            // [{amfiCode, schemeName, value}] deduped from CAS
  const [casLoading, setCasLoading] = useState(true);
  const [holdingsByFund, setHoldingsByFund] = useState({}); // amfiCode -> holdings API response
  const [holdingsError, setHoldingsError] = useState({});   // amfiCode -> error message
  const [proposalType, setProposalType] = useState('lumpsum'); // 'lumpsum' | 'sip'
  const [sipFrequency, setSipFrequency] = useState('monthly');  // 'daily' | 'monthly'
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientFieldsTouched, setClientFieldsTouched] = useState(false);
  // "Prepared By" -- editable so a distributor other than Atin can use this
  // tool for their own clients (their name/ARN/etc, not hardcoded ones),
  // while Abundance's own brand stays visible via the fixed "Powered by"
  // mark and running header, which these fields don't touch. Defaults
  // preserve today's zero-typing experience for the current sole user.
  const [advisorName, setAdvisorName] = useState('Atin Kumar Agrawal');
  const [advisorPhone, setAdvisorPhone] = useState('9808105923');
  const [advisorEmail, setAdvisorEmail] = useState('atin@getabundance.in');
  const [advisorArn, setAdvisorArn] = useState('ARN-251838');
  const [advisorEuin, setAdvisorEuin] = useState('E468841');
  const [advisorFieldsTouched, setAdvisorFieldsTouched] = useState(false);
  const [savedProposalId, setSavedProposalId] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState('');
  const [savedListRefresh, setSavedListRefresh] = useState(0);

  // Total is a derived sum of every selected fund's amount, not a separate
  // target you set first -- add funds, type an amount for each, the total
  // just adds up. Requiring a total upfront blocked basic use.
  const totalAmount = selectedFunds.reduce((s, f) => s + (f.amount || 0), 0);
  const mCapIndex = useMCapIndex();

  // Prefill client details from session, only until the user edits
  useEffect(() => {
    if (clientFieldsTouched) return;
    if (session?.user?.name) setClientName(session.user.name);
    if (session?.user?.email) setClientEmail(session.user.email);
  }, [session, clientFieldsTouched]);

  // Prefill advisor name from the signed-in user's own session -- they ARE
  // the advisor using this tool -- only until they edit it themselves.
  // Email/ARN/EUIN/phone have no reliable session source (a signed-in
  // user's session email may not be their professional one), so they keep
  // their own hardcoded defaults (today's real, sole user) until edited.
  useEffect(() => {
    if (advisorFieldsTouched) return;
    if (session?.user?.name) setAdvisorName(session.user.name);
  }, [session, advisorFieldsTouched]);

  // Load the user's CAS-derived fund list once on mount, including each
  // fund's real current value (units x NAV, same computation app/portfolio/page.jsx
  // already does) so it can pre-fill an accurate amount instead of an even split.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const listRes = await fetch('/api/cas/list').then((r) => r.json());
        const portfolios = listRes.portfolios || [];
        const seen = new Map(); // amfiCode -> {schemeName, value}
        for (const p of portfolios) {
          const data = await fetch(`/api/cas/load?key=${encodeURIComponent(p.blob_key)}`).then((r) => r.json());
          for (const folio of data.folios || []) {
            for (const scheme of folio.schemes || []) {
              const units = parseFloat(scheme.close) || 0;
              if (scheme.amfi && units > 0.001) {
                const nav = parseFloat(scheme.valuation?.nav || 0);
                seen.set(scheme.amfi, { schemeName: scheme.scheme, value: Math.round(units * nav * 100) / 100 });
              }
            }
          }
        }
        if (!cancelled) {
          setCasFunds([...seen.entries()].map(([amfiCode, v]) => ({ amfiCode, schemeName: v.schemeName, value: v.value })));
        }
      } catch {
        if (!cancelled) setCasFunds([]);
      } finally {
        if (!cancelled) setCasLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Lets app/proposal-studio/mine/[id]/page.js's "Edit this proposal"
  // button navigate here and have that proposal load automatically,
  // reusing the same loadSavedProposal flow a saved-list row click already
  // triggers.
  const searchParams = useSearchParams();
  const loadParam = searchParams.get('load');
  useEffect(() => {
    if (loadParam) loadSavedProposal(loadParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadParam]);

  function addCasFund(amfiCode, schemeName, value) {
    if (selectedFunds.some((f) => f.amfiCode === amfiCode)) return;
    // CAS funds already carry their real invested value -- nothing to fill in later.
    setSelectedFunds((prev) => [...prev, { amfiCode, schemeName: prettifySchemeName(schemeName), amount: value, source: 'cas', amountTouched: true }]);
  }

  function addManualFund(amfiCode, schemeName) {
    if (selectedFunds.some((f) => f.amfiCode === amfiCode)) return;
    // Starts at 0; the holdings-fetch effect below fills in the fund's real
    // minimum investment amount once its data arrives, unless the user has
    // already typed their own amount in the meantime (amountTouched).
    setSelectedFunds((prev) => [...prev, { amfiCode, schemeName: prettifySchemeName(schemeName), amount: 0, source: 'manual', amountTouched: false }]);
  }

  function removeFund(amfiCode) {
    setSelectedFunds((prev) => prev.filter((f) => f.amfiCode !== amfiCode));
  }

  function setFundAmount(amfiCode, amount) {
    setSelectedFunds((prev) => prev.map((f) => (f.amfiCode === amfiCode ? { ...f, amount, amountTouched: true } : f)));
  }

  // Fetch holdings for any selected fund not yet loaded.
  useEffect(() => {
    selectedFunds.forEach(({ amfiCode, schemeName }) => {
      if (holdingsByFund[amfiCode] || holdingsError[amfiCode]) return;
      fetch(`/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(amfiCode)}&schemeName=${encodeURIComponent(schemeName)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setHoldingsError((prev) => ({ ...prev, [amfiCode]: data.error }));
          } else {
            setHoldingsByFund((prev) => ({ ...prev, [amfiCode]: data }));
            // Default a just-added manual fund's amount to its real minimum
            // investment (matching the current proposal type) instead of
            // leaving it at 0 -- but only if the user hasn't already typed
            // their own amount in the meantime.
            setSelectedFunds((prev) => prev.map((f) => {
              if (f.amfiCode !== amfiCode || f.source !== 'manual' || f.amountTouched) return f;
              const min = proposalType === 'sip' ? data.minSipInvestment : data.minInvestment;
              return min > 0 ? { ...f, amount: min } : f;
            }));
          }
        })
        .catch(() => setHoldingsError((prev) => ({ ...prev, [amfiCode]: 'Failed to load holdings' })));
    });
  }, [selectedFunds, holdingsByFund, holdingsError, proposalType]);

  // The effect above only sets a fund's minimum-investment default at the
  // moment its holdings first arrive. If the user switches Lumpsum <-> SIP
  // AFTER that (for a fund whose amount was never manually edited), this
  // keeps the amount synced to the newly-relevant minimum instead of
  // silently staying at the old proposal type's figure. amountTouched is
  // deliberately never set by auto-fill (see addManualFund/the effect
  // above) specifically so this can keep tracking it.
  useEffect(() => {
    setSelectedFunds((prev) => prev.map((f) => {
      if (f.source !== 'manual' || f.amountTouched) return f;
      const data = holdingsByFund[f.amfiCode];
      if (!data) return f; // still loading -- the fetch effect will set it on arrival
      const min = proposalType === 'sip' ? data.minSipInvestment : data.minInvestment;
      return min > 0 && f.amount !== min ? { ...f, amount: min } : f;
    }));
  }, [proposalType, holdingsByFund]);

  // Always inserts a new row -- each save is its own snapshot (matching the
  // existing CAS-upload pattern, where re-uploading also creates a new saved
  // record rather than editing one in place), not an update of a prior save.
  async function saveProposal() {
    setSaveStatus('saving');
    setSaveError('');
    try {
      const res = await fetch('/api/proposal-studio/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName, clientEmail, clientPhone, proposalType, sipFrequency, totalAmount,
          advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin,
          selectedFunds: selectedFunds.map((f) => ({ amfiCode: f.amfiCode, schemeName: f.schemeName, amount: f.amount, source: f.source })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      setSavedProposalId(data.id);
      setSaveStatus('saved');
      setSavedListRefresh((n) => n + 1);
    } catch (err) {
      setSaveError(err.message);
      setSaveStatus('error');
    }
  }

  async function loadSavedProposal(id) {
    setSaveStatus('idle');
    setSaveError('');
    try {
      const data = await fetch(`/api/proposal-studio/load?id=${encodeURIComponent(id)}`).then((r) => r.json());
      if (data.error) throw new Error(data.error);
      setClientFieldsTouched(true);
      setClientName(data.clientName || '');
      setClientEmail(data.clientEmail || '');
      setClientPhone(data.clientPhone || '');
      setAdvisorFieldsTouched(true);
      setAdvisorName(data.advisorName || 'Atin Kumar Agrawal');
      setAdvisorPhone(data.advisorPhone || '9808105923');
      setAdvisorEmail(data.advisorEmail || 'atin@getabundance.in');
      setAdvisorArn(data.advisorArn || 'ARN-251838');
      setAdvisorEuin(data.advisorEuin || 'E468841');
      setProposalType(data.proposalType || 'lumpsum');
      setSipFrequency(data.sipFrequency || 'monthly');
      setSelectedFunds((data.selectedFunds || []).map((f) => ({
        amfiCode: f.amfiCode, schemeName: prettifySchemeName(f.schemeName), amount: f.amount || 0, source: f.source || 'manual', amountTouched: true,
      })));
      setSavedProposalId(id);
      setSaveStatus('saved');
    } catch (err) {
      setSaveError(err.message);
      setSaveStatus('error');
    }
  }

  return (
    <div className="pfc-tool">
      <SavedProposalsSection onLoad={loadSavedProposal} refreshKey={savedListRefresh} />
      <ClientDetailsCard
        clientName={clientName} setClientName={setClientName}
        clientEmail={clientEmail} setClientEmail={setClientEmail}
        clientPhone={clientPhone} setClientPhone={setClientPhone}
        onTouched={() => setClientFieldsTouched(true)}
      />
      <AdvisorDetailsCard
        advisorName={advisorName} setAdvisorName={setAdvisorName}
        advisorPhone={advisorPhone} setAdvisorPhone={setAdvisorPhone}
        advisorEmail={advisorEmail} setAdvisorEmail={setAdvisorEmail}
        advisorArn={advisorArn} setAdvisorArn={setAdvisorArn}
        advisorEuin={advisorEuin} setAdvisorEuin={setAdvisorEuin}
        onTouched={() => setAdvisorFieldsTouched(true)}
      />
      <FundPicker
        selectedFunds={selectedFunds}
        casFunds={casFunds}
        casLoading={casLoading}
        proposalType={proposalType}
        setProposalType={setProposalType}
        sipFrequency={sipFrequency}
        setSipFrequency={setSipFrequency}
        totalAmount={totalAmount}
        onAddCas={addCasFund}
        onAddManual={addManualFund}
        onRemove={removeFund}
        onAmountChange={setFundAmount}
      />
      {selectedFunds.length > 0 && (
        <ProposalAnalysisBlock
          selectedFunds={selectedFunds}
          holdingsByFund={holdingsByFund}
          holdingsError={holdingsError}
          totalAmount={totalAmount}
          mCapIndex={mCapIndex}
          proposalType={proposalType}
          sipFrequency={sipFrequency}
          clientName={clientName}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          advisorName={advisorName}
          advisorPhone={advisorPhone}
          advisorEmail={advisorEmail}
          advisorArn={advisorArn}
          advisorEuin={advisorEuin}
          proposalId={savedProposalId}
          actionsExtra={
            <>
              <button className="pfc-save-btn" disabled={saveStatus === 'saving'} onClick={saveProposal}>
                {saveStatus === 'saving' ? 'Saving…' : 'Save Proposal'}
              </button>
              {saveStatus === 'saved' && savedProposalId && (
                <span className="pfc-proposal-id">Saved · Proposal ID: {formatProposalId(savedProposalId)}</span>
              )}
              {saveStatus === 'error' && <span className="pfc-error-hint">{saveError}</span>}
              {saveStatus === 'saved' && savedProposalId && (
                <ShareControls key={savedProposalId} proposalId={savedProposalId} initialShareToken={null} clientEmail={clientEmail} />
              )}
            </>
          }
        />
      )}
    </div>
  );
}

function FundPicker({ selectedFunds, casFunds, casLoading, proposalType, setProposalType, sipFrequency, setSipFrequency, totalAmount, onAddCas, onAddManual, onRemove, onAmountChange }) {
  const [tab, setTab] = useState('cas');
  const [searchKind, setSearchKind] = useState('mf'); // 'mf' | 'sif'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showIdcw, setShowIdcw] = useState(false);
  const [sifList, setSifList] = useState([]);
  const [sifLoading, setSifLoading] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    if (tab !== 'search' || searchKind !== 'mf') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 3) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetch(`/api/mf?q=${encodeURIComponent(query.trim())}`).then((r) => r.json());
        let filtered = (Array.isArray(data) ? data : []).filter((s) => !/\bdirect\b/i.test(s.schemeName));
        if (!showIdcw) {
          filtered = filtered.filter((s) => !/\b(idcw|dividend|bonus|payout|reinvest)\b/i.test(s.schemeName));
        }
        setResults(filtered.slice(0, 40));
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 280);
    return () => timerRef.current && clearTimeout(timerRef.current);
  }, [query, tab, showIdcw, searchKind]);

  // SIF list is small and static per session -- fetch once, filter client-side
  // as the user types (same pattern app/backtest/page.js's Picker already uses).
  useEffect(() => {
    fetch('/api/sif-nav')
      .then((r) => r.json())
      .then((d) => setSifList(d.schemes || []))
      .catch(() => setSifList([]))
      .finally(() => setSifLoading(false));
  }, []);

  const sifFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sifList.filter((s) => !q || (s.nav_name || '').toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q));
  }, [query, sifList]);

  const selectedCodes = new Set(selectedFunds.map((f) => f.amfiCode));

  return (
    <section className="pfc-picker">
      <div className="pfc-proposal-type">
        <div className="pfc-picker-tabs">
          <button className={proposalType === 'lumpsum' ? 'on' : ''} onClick={() => setProposalType('lumpsum')}>Lumpsum</button>
          <button className={proposalType === 'sip' ? 'on' : ''} onClick={() => setProposalType('sip')}>SIP</button>
        </div>
        <div className="pfc-total-input">
          <span>Total {proposalType === 'sip' ? 'SIP' : 'Lumpsum'} Amount</span>
          <div className="pfc-total-readout">₹{totalAmount.toLocaleString('en-IN')}</div>
        </div>
        {proposalType === 'sip' && (
          <div className="pfc-picker-tabs pfc-freq-tabs">
            <button className={sipFrequency === 'monthly' ? 'on' : ''} onClick={() => setSipFrequency('monthly')}>Monthly</button>
            <button className={sipFrequency === 'daily' ? 'on' : ''} onClick={() => setSipFrequency('daily')}>Daily</button>
          </div>
        )}
      </div>

      <div className="pfc-picker-tabs">
        <button className={tab === 'cas' ? 'on' : ''} onClick={() => setTab('cas')}>From your CAS holdings</button>
        <button className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>Search any fund</button>
      </div>

      {tab === 'cas' && (
        <div className="pfc-picker-list">
          {casLoading && <div className="pfc-hint">Loading your CAS holdings…</div>}
          {!casLoading && casFunds.length === 0 && <div className="pfc-hint">No CAS statement found. Upload one on the CAS Tracker page, or search for a fund manually.</div>}
          {casFunds.map((f) => (
            <button
              key={f.amfiCode}
              className="pfc-picker-item"
              disabled={selectedCodes.has(f.amfiCode)}
              onClick={() => onAddCas(f.amfiCode, f.schemeName, f.value)}
            >
              {f.schemeName}
              <span className="pfc-add">{selectedCodes.has(f.amfiCode) ? 'Added' : `Add · ₹${f.value.toLocaleString('en-IN')}`}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'search' && (
        <div className="pfc-picker-list">
          <div className="pfc-picker-tabs pfc-search-kind-tabs">
            <button className={searchKind === 'mf' ? 'on' : ''} onClick={() => setSearchKind('mf')}>Mutual Funds</button>
            <button className={searchKind === 'sif' ? 'on' : ''} onClick={() => setSearchKind('sif')}>SIFs</button>
          </div>
          <input
            className="pfc-search-input"
            placeholder={searchKind === 'sif' ? "Filter SIFs by name or category…" : "Type at least 3 letters, e.g. 'parag parikh flexi'…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searchKind === 'mf' && (
            <label className="pfc-idcw-toggle">
              <input type="checkbox" checked={showIdcw} onChange={(e) => setShowIdcw(e.target.checked)} />
              Show IDCW/Dividend plans
            </label>
          )}
          {searchKind === 'mf' && searching && <div className="pfc-hint">Searching…</div>}
          {searchKind === 'mf' && !searching && query.trim().length >= 3 && results.length === 0 && <div className="pfc-hint">No funds matched. Try a simpler keyword.</div>}
          {searchKind === 'mf' && results.map((s) => (
            <button
              key={s.schemeCode}
              className="pfc-picker-item"
              disabled={selectedCodes.has(s.schemeCode)}
              onClick={() => onAddManual(s.schemeCode, s.schemeName)}
            >
              {s.schemeName}
              <span className="pfc-add">{selectedCodes.has(s.schemeCode) ? 'Added' : 'Add'}</span>
            </button>
          ))}
          {searchKind === 'sif' && sifLoading && <div className="pfc-hint">Loading SIFs…</div>}
          {searchKind === 'sif' && !sifLoading && sifFiltered.length === 0 && <div className="pfc-hint">No SIFs matched.</div>}
          {searchKind === 'sif' && sifFiltered.map((s) => (
            <button
              key={s.scheme_id}
              className="pfc-picker-item"
              disabled={selectedCodes.has(s.scheme_id)}
              onClick={() => onAddManual(s.scheme_id, s.nav_name)}
            >
              {s.nav_name}
              <span className="pfc-add">{selectedCodes.has(s.scheme_id) ? 'Added' : 'Add'}</span>
            </button>
          ))}
        </div>
      )}

      {selectedFunds.length > 0 && (
        <div className="pfc-selected">
          <h3>Selected funds ({selectedFunds.length})</h3>
          {selectedFunds.map((f) => (
            <div className="pfc-selected-item" key={f.amfiCode}>
              <div className="pfc-selected-row">
                <div className="pfc-selected-main">
                  <ProviderAvatar name={f.schemeName} logoPath={getMFLogoFromSchemeName(f.schemeName)} size={24} radius={6} />
                  <span className="pfc-selected-name">{f.schemeName}</span>
                </div>
                <div className="pfc-selected-controls">
                  <div className="pfc-amount-input"><i>₹</i>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={f.amount}
                      onChange={(e) => onAmountChange(f.amfiCode, Math.max(0, +e.target.value || 0))}
                    />
                  </div>
                  <button className="pfc-remove" onClick={() => onRemove(f.amfiCode)}>Remove</button>
                </div>
              </div>
              {f.amount <= 0 && (
                <div className="pfc-zero-hint">This fund has no amount yet — set one to include it in the analysis.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
