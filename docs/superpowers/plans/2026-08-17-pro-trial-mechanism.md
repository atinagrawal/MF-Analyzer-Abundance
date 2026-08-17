# Time-Boxed Pro Trial Mechanism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin grant a client a time-boxed Pro trial from the existing admin panel, auto-expiring via already-existing session logic, visible to both admin and client, followed by one automatic "trial ended" email.

**Architecture:** Adds `'trial'` as a new value of the existing `users.plan` column (no new tables). `PATCH /api/admin/users` gains trial-granting logic; `auth.js`'s session callback gains one more branch mirroring its existing annual-Pro expiry check; `app/admin/UsersTab.jsx` and `components/Navbar.jsx` each gain a small, additive UI case; `scripts/send_lifecycle_emails.mjs` gains a third one-shot email block matching its existing two.

**Tech Stack:** Next.js App Router API routes (Node runtime), React client components, Postgres (`lib/db.js`'s existing pool), Resend (existing lifecycle-email script).

## Global Constraints

- No new database tables or columns — `plan` (already free-text `TEXT`) gains one new allowed value, `'trial'`; `plan_expires_at` (already `TIMESTAMPTZ`, nullable) is reused as-is.
- A trial's row is **never** reset back to `'free'` after expiry — `plan` stays `'trial'` forever once granted; the session callback's existing expiry check already correctly downgrades *access* without needing the stored value to change. This is deliberate (doubles as the "trial used" marker) — do not "clean up" expired trial rows in any task.
- When the admin sets any plan value **other than** `'trial'` via the admin panel, `plan_expires_at` must be cleared to `NULL` — closes a real correctness bug where a leftover past `plan_expires_at` from an old trial would make a fresh manual Pro/Lifetime grant look already-expired.
- Admin panel duration choice is 1 / 3 / 7 days, admin picks every time — no fixed default, no auto-submit without an explicit choice.
- One automatic "trial has ended" email, sent once ever per user (existing `lifecycle_emails_sent` UNIQUE(user_id, email_type) dedup, new `email_type = 'trial_ended'`). No pre-expiry reminder email. No in-app resend button.
- Test convention: plain Node + `assert`, `node tests/<file>.test.js`, no framework. This feature introduces no new `lib/` module with pure logic worth unit testing (confirmed in the design spec's own Testing section) — every task below is manually verified; do not invent a test file that doesn't fit.

---

## File Structure

- **Modify** `app/api/admin/users/route.js` — `GET` gains `plan_expires_at` in its SELECT; `PATCH` gains `'trial'` handling (validates `trialDays`, computes `plan_expires_at`, returns it) and the plan_expires_at-clearing fix for non-trial grants.
- **Modify** `app/admin/UsersTab.jsx` — `PlanBadge` gains active-trial and trial-used states; `RoleAndPlanSelect` gains a two-step "Start Trial → pick duration → Grant" flow; `changePlan` threads the new `trialDays` argument and the server-returned expiry into local state.
- **Modify** `auth.js` — session callback gains an `isTrial` branch.
- **Modify** `components/Navbar.jsx` — plan badge gains a trial case; the existing annual-only renewal reminder generalizes to also cover trials, with a "today" wording fix.
- **Modify** `scripts/send_lifecycle_emails.mjs` — gains a third email type, `trial_ended`, following the file's existing two-block pattern exactly.
- **Modify** `scripts/schema.sql` — two comment updates (documentation only, no `ALTER TABLE`): the `plan` column's comment gains the `'trial'` value, and `lifecycle_emails_sent.email_type`'s comment gains `'trial_ended'`.

---

### Task 1: Admin can grant a trial — `PATCH /api/admin/users`

**Files:**
- Modify: `app/api/admin/users/route.js` (whole file is 112 lines; `PATCH` handler at lines 68-111)
- Modify: `scripts/schema.sql` (the `plan` column's doc comment, lines 177-184)

**Interfaces:**
- Produces: `PATCH /api/admin/users` body gains an optional `trialDays` field (required, integer 1-30, when `plan === 'trial'`); response gains `planExpiresAt` (ISO string or `null`) whenever `plan` was set. Consumed by Task 2.

- [ ] **Step 1: Update the PATCH handler**

Replace the whole `PATCH` function (lines 68-111) in `app/api/admin/users/route.js`:

```js
export async function PATCH(req) {
  try {
    const session = await auth();
    if (!session?.user?.id)            return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' },     { status: 403 });

    const { userId, role, plan, trialDays, distributorId } = await req.json();
    const VALID_ROLES = ['client', 'distributor', 'admin'];
    const VALID_PLANS = ['free', 'pro', 'pro_lifetime', 'lifetime', 'trial'];

    if (!userId) {
      return Response.json({ error: 'userId is required' }, { status: 400 });
    }

    if (role) {
      if (!VALID_ROLES.includes(role)) {
        return Response.json({ error: 'Invalid role' }, { status: 400 });
      }
      // Prevent removing your own admin role
      if (userId === session.user.id && role !== 'admin') {
        return Response.json({ error: 'Cannot demote yourself' }, { status: 400 });
      }
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    }

    let planExpiresAt;
    if (plan !== undefined) {
      if (plan !== null && !VALID_PLANS.includes(plan)) {
        return Response.json({ error: 'Invalid plan' }, { status: 400 });
      }
      if (plan === 'trial') {
        const days = Number(trialDays);
        if (!Number.isInteger(days) || days < 1 || days > 30) {
          return Response.json({ error: 'trialDays must be an integer between 1 and 30' }, { status: 400 });
        }
        const { rows } = await pool.query(
          `UPDATE users SET plan = 'trial', plan_expires_at = NOW() + ($1 || ' days')::interval WHERE id = $2 RETURNING plan_expires_at`,
          [days, userId]
        );
        planExpiresAt = rows[0].plan_expires_at;
      } else {
        // Free/Pro/Pro Lifetime granted here are always permanent -- clear
        // any leftover plan_expires_at (e.g. from a prior trial) so it can't
        // be misread later as an already-expired grant. See
        // docs/superpowers/specs/2026-08-17-pro-trial-mechanism-design.md
        // ("Background") for the exact bug this prevents.
        await pool.query('UPDATE users SET plan = $1, plan_expires_at = NULL WHERE id = $2', [plan, userId]);
        planExpiresAt = null;
      }
    }

    if (distributorId !== undefined) {
      const targetDistributor = distributorId ? distributorId : null;
      await pool.query('UPDATE users SET distributor_id = $1 WHERE id = $2', [targetDistributor, userId]);
    }

    return Response.json({
      ok: true, userId, role, plan, distributorId,
      planExpiresAt: plan !== undefined ? planExpiresAt : undefined,
    });

  } catch (err) {
    console.error('[admin/users PATCH]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
```

Also update the file's header doc comment (currently `Body: { userId, role }\nUpdates a user's role.`, above the `PATCH` function) to:

```js
/**
 * PATCH /api/admin/users
 * Body: { userId, role?, plan?, trialDays?, distributorId? }
 * Updates a user's role, plan (trialDays required and must be an integer
 * 1-30 when plan === 'trial'), and/or assigned distributor.
 */
```

- [ ] **Step 2: Update `scripts/schema.sql`'s `plan` column comment**

Change (lines 177-184):

```sql
-- ── users: paid-plan + distributor columns ──────────────────────────────────
-- Added by the Lifetime-plan and distributor-scoping features, after the
-- base `users` table above was first written. plan/plan_expires_at are the
-- source auth.js's session callback normalizes into session.user.plan
-- ('free' | 'pro'). distributor_id/created_by back lib/permissions.js's
-- canManageUser() (a distributor may manage a client only if one of these
-- points at that distributor).
```

to:

```sql
-- ── users: paid-plan + distributor columns ──────────────────────────────────
-- Added by the Lifetime-plan and distributor-scoping features, after the
-- base `users` table above was first written. plan/plan_expires_at are the
-- source auth.js's session callback normalizes into session.user.plan
-- ('free' | 'pro'). Raw `plan` values: 'free' | 'pro' | 'pro_lifetime' |
-- 'trial' (a time-boxed Pro grant -- see app/api/admin/users/route.js's
-- PATCH handler and
-- docs/superpowers/specs/2026-08-17-pro-trial-mechanism-design.md). A
-- trial row is deliberately left as plan='trial' forever after it
-- expires -- doubles as a "this client has used a trial" marker for the
-- admin panel, since the session callback's own expiry check already
-- handles downgrading actual access without needing the stored value to
-- change. distributor_id/created_by back lib/permissions.js's
-- canManageUser() (a distributor may manage a client only if one of these
-- points at that distributor).
```

- [ ] **Step 3: Also select `plan_expires_at` in the GET handler**

In the same file, the `GET` handler's SQL query currently selects `u.plan` (among other columns) but not `u.plan_expires_at`. Change the `SELECT` list from:

```sql
      SELECT
        u.id,
        u.name,
        u.email,
        u.image,
        u.role,
        u.plan,
        u.distributor_id,
```

to:

```sql
      SELECT
        u.id,
        u.name,
        u.email,
        u.image,
        u.role,
        u.plan,
        u.plan_expires_at,
        u.distributor_id,
```

- [ ] **Step 4: Manual verification**

Start `npm run dev`, sign in as an admin, and use `curl` (with your browser's session cookie, or via the admin UI once Task 2 lands) to confirm:

```bash
curl -s -X PATCH http://localhost:3000/api/admin/users \
  -H "Content-Type: application/json" -H "Cookie: <your admin session cookie>" \
  -d '{"userId":"<a-test-user-id>","plan":"trial","trialDays":3}'
```

Expected: `200` with `"plan":"trial"` and `"planExpiresAt"` set to a timestamp roughly 3 days out.

```bash
curl -s -X PATCH http://localhost:3000/api/admin/users \
  -H "Content-Type: application/json" -H "Cookie: <your admin session cookie>" \
  -d '{"userId":"<the-same-test-user-id>","plan":"trial","trialDays":40}'
```

Expected: `400`, `"trialDays must be an integer between 1 and 30"`.

```bash
curl -s -X PATCH http://localhost:3000/api/admin/users \
  -H "Content-Type: application/json" -H "Cookie: <your admin session cookie>" \
  -d '{"userId":"<the-same-test-user-id>","plan":"pro"}'
```

Expected: `200` with `"planExpiresAt":null` — confirms the correctness fix (the leftover trial expiry from the first call was cleared).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/users/route.js scripts/schema.sql
git commit -m "feat(admin): support granting a time-boxed Pro trial"
```

---

### Task 2: Admin panel UI — grant and see trial status

**Files:**
- Modify: `app/admin/UsersTab.jsx` (whole file is ~628 lines; `PlanBadge` at lines 27-43, `RoleAndPlanSelect` at lines 80-144, `changePlan` at lines 332-346, `PlanBadge` call sites at lines 90 and 550)

**Interfaces:**
- Consumes: `PATCH /api/admin/users`'s `trialDays` field and `planExpiresAt` response field (Task 1).

- [ ] **Step 1: Update `PlanBadge` to show trial states**

Replace the whole `PlanBadge` function (lines 27-43):

```jsx
function PlanBadge({ plan, planExpiresAt }) {
  if (!plan || plan === 'free') return null;

  if (plan === 'trial') {
    const expires = planExpiresAt ? new Date(planExpiresAt) : null;
    const isActive = expires && expires > new Date();
    if (isActive) {
      const daysLeft = Math.max(1, Math.ceil((expires - new Date()) / 86400000));
      return (
        <span style={{
          fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px',
          textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4,
          fontFamily: "'JetBrains Mono', monospace",
          background: '#e3f2fd', color: '#1565c0', border: '1px solid #bbdefb',
          marginLeft: 4,
        }}>
          TRIAL · {daysLeft}D LEFT
        </span>
      );
    }
    return (
      <span style={{
        fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px',
        textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4,
        fontFamily: "'JetBrains Mono', monospace",
        background: 'var(--s2)', color: 'var(--muted)', border: '1px solid var(--border)',
        marginLeft: 4,
      }}>
        TRIAL USED
      </span>
    );
  }

  const isLifetime = plan === 'pro_lifetime' || plan === 'lifetime';
  return (
    <span style={{
      fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px',
      textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4,
      fontFamily: "'JetBrains Mono', monospace",
      background: isLifetime ? '#e0f7fa' : '#e8f5e9',
      color: isLifetime ? '#006064' : '#1b5e20',
      border: `1px solid ${isLifetime ? '#b2ebf2' : '#c8e6c9'}`,
      marginLeft: 4,
    }}>
      {isLifetime ? 'PRO LIFETIME' : 'PRO'}
    </span>
  );
}
```

- [ ] **Step 2: Update `RoleAndPlanSelect`'s plan dropdown to a two-step trial flow**

Replace the whole `RoleAndPlanSelect` function (lines 80-144):

```jsx
function RoleAndPlanSelect({ user, sessionUserId, distributors = [], roleChanging, planChanging, distributorChanging, onRoleChange, onPlanChange, onDistributorChange, isAdmin = true }) {
  const [startingTrial, setStartingTrial] = useState(false);
  const [trialDays, setTrialDays] = useState(3);

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        <div className="admin-role-row">
          <span className="admin-role-row-label">Role</span>
          <RoleBadge role={user.role} />
        </div>
        <div className="admin-role-row">
          <span className="admin-role-row-label">Plan</span>
          {user.plan && user.plan !== 'free' ? <PlanBadge plan={user.plan} planExpiresAt={user.plan_expires_at} /> : <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>Free</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      <div className="admin-role-row">
        <span className="admin-role-row-label">Role</span>
        <select
          className="admin-role-select"
          value={user.role}
          disabled={roleChanging === user.id || user.id === sessionUserId}
          onChange={e => onRoleChange(user.id, e.target.value)}
        >
          <option value="client">client</option>
          <option value="distributor">distributor</option>
          <option value="admin">admin</option>
        </select>
      </div>

      <div className="admin-role-row">
        <span className="admin-role-row-label">Plan</span>
        <select
          className="admin-role-select"
          value={startingTrial ? 'trial' : (user.plan || 'free')}
          disabled={planChanging === user.id}
          onChange={e => {
            const next = e.target.value;
            if (next === 'trial') { setStartingTrial(true); return; }
            setStartingTrial(false);
            onPlanChange(user.id, next);
          }}
        >
          <option value="free">Free Plan</option>
          <option value="pro">Pro Plan</option>
          <option value="pro_lifetime">Pro Lifetime</option>
          <option value="trial">Start Trial…</option>
        </select>
      </div>

      {startingTrial && (
        <div className="admin-role-row">
          <span className="admin-role-row-label">Trial length</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              className="admin-role-select"
              value={trialDays}
              onChange={e => setTrialDays(Number(e.target.value))}
            >
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
            </select>
            <button
              type="button"
              disabled={planChanging === user.id}
              onClick={() => { onPlanChange(user.id, 'trial', trialDays); setStartingTrial(false); }}
              style={{
                fontSize: '.62rem', fontWeight: 800, padding: '6px 12px', borderRadius: 6,
                border: 'none', background: 'var(--g1)', color: '#fff',
                cursor: planChanging === user.id ? 'wait' : 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {planChanging === user.id ? '…' : 'Grant'}
            </button>
            <button
              type="button"
              onClick={() => setStartingTrial(false)}
              style={{
                fontSize: '.62rem', fontWeight: 700, padding: '6px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="admin-role-row">
        <span className="admin-role-row-label">Assigned MFD</span>
        <select
          className="admin-role-select"
          value={user.distributor_id || ''}
          disabled={distributorChanging === user.id}
          onChange={e => onDistributorChange(user.id, e.target.value)}
        >
          <option value="">Unassigned (None)</option>
          {distributors.map(d => (
            <option key={d.id} value={d.id}>
              {d.name || d.email}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `changePlan` to thread `trialDays` and the returned expiry**

Replace the whole `changePlan` function (lines 332-346):

```jsx
  async function changePlan(userId, newPlan, trialDays) {
    setPlanChanging(userId);
    try {
      const body = trialDays !== undefined ? { userId, plan: newPlan, trialDays } : { userId, plan: newPlan };
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan: newPlan, plan_expires_at: d.planExpiresAt ?? null } : u));
      setSelectedUser(prev => prev && prev.id === userId ? { ...prev, plan: newPlan, plan_expires_at: d.planExpiresAt ?? null } : prev);
    } catch (e) { alert(e.message); }
    finally { setPlanChanging(''); }
  }
```

- [ ] **Step 4: Update the two `<PlanBadge>` call sites to pass `planExpiresAt`**

At line 550 (desktop table row), change:

```jsx
                      <RoleBadge role={u.role} />
                      <PlanBadge plan={u.plan} />
```

to:

```jsx
                      <RoleBadge role={u.role} />
                      <PlanBadge plan={u.plan} planExpiresAt={u.plan_expires_at} />
```

(The other call site, inside `RoleAndPlanSelect`'s `!isAdmin` read-only branch, was already updated in Step 2 above as part of replacing the whole function.)

- [ ] **Step 5: Manual verification**

With `npm run dev` running, sign in as admin, open `/admin` → Users, select a test user, choose "Start Trial…" in the Plan dropdown: confirm the duration selector + Grant/Cancel buttons appear and nothing is submitted yet. Click Cancel: confirm the dropdown reverts to the user's actual current plan with no request sent. Repeat and click Grant with 1 day selected: confirm a `TRIAL · 1D LEFT` badge appears immediately in both the table row and the detail panel (no page reload needed). Manually set that test user's `plan_expires_at` to a past timestamp directly in the database, reload the admin page, and confirm the badge now reads `TRIAL USED`.

- [ ] **Step 6: Commit**

```bash
git add app/admin/UsersTab.jsx
git commit -m "feat(admin): add Start Trial flow and trial status badges to Users tab"
```

---

### Task 3: Session access gating — `auth.js`

**Files:**
- Modify: `auth.js` (session callback at lines 275-292)

**Interfaces:**
- Produces: `session.user.planTier` gains a `'trial'` value (alongside existing `'free'`/`'annual'`/`'lifetime'`); `session.user.plan`/`planExpiresAt` correctly reflect an active trial the same way they already do for annual Pro. Consumed by Task 4.

- [ ] **Step 1: Add the `isTrial` branch**

In `auth.js`'s `session` callback, change:

```js
        const plan    = user.plan ?? 'free';
        const expires = user.plan_expires_at ? new Date(user.plan_expires_at) : null;
        const isLifetime  = plan === 'pro_lifetime';
        const isProAnnual = plan === 'pro' && expires && expires > new Date();
        session.user.plan          = (isLifetime || isProAnnual) ? 'pro' : 'free';
        session.user.planTier      = isLifetime ? 'lifetime' : isProAnnual ? 'annual' : 'free';
        session.user.planExpiresAt = isProAnnual ? expires.toISOString() : null;
```

to:

```js
        const plan    = user.plan ?? 'free';
        const expires = user.plan_expires_at ? new Date(user.plan_expires_at) : null;
        const isLifetime  = plan === 'pro_lifetime';
        const isProAnnual = plan === 'pro'   && expires && expires > new Date();
        const isTrial     = plan === 'trial' && expires && expires > new Date();
        session.user.plan          = (isLifetime || isProAnnual || isTrial) ? 'pro' : 'free';
        session.user.planTier      = isLifetime ? 'lifetime' : isProAnnual ? 'annual' : isTrial ? 'trial' : 'free';
        session.user.planExpiresAt = (isProAnnual || isTrial) ? expires.toISOString() : null;
```

- [ ] **Step 2: Manual verification**

With a test user's `plan` set to `'trial'` and `plan_expires_at` in the future (via Task 1/2's flow, or directly in the database), sign in as that user and confirm every existing Pro-gate in the app (e.g. Proposal Studio) now treats them as Pro. Set `plan_expires_at` to a past timestamp, force a fresh session read (sign out/in, or wait for the session to refresh), and confirm access reverts to free — no code change needed for this second part, it's confirming the pre-existing expiry logic now also applies correctly to the new `isTrial` branch.

- [ ] **Step 3: Commit**

```bash
git add auth.js
git commit -m "feat(auth): recognize an active trial as Pro access in the session callback"
```

---

### Task 4: Client-facing trial visibility — `Navbar.jsx`

**Files:**
- Modify: `components/Navbar.jsx` (lines 325-424: `planTier`/`daysToExpiry`/`showRenewalReminder` computation at 331-339, badge JSX at 406-417, reminder JSX at 419-423)

**Interfaces:**
- Consumes: `session.user.planTier === 'trial'` and `session.user.planExpiresAt` (Task 3).

- [ ] **Step 1: Generalize `daysToExpiry` to cover trials**

Change:

```js
  const planTier  = user?.planTier || 'free'; // 'free' | 'annual' | 'lifetime'
  const initials  = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // On-site renewal reminder — annual Pro only, within 30 days of expiry.
  // Lifetime members never expire, so this never applies to them.
  const daysToExpiry = (planTier === 'annual' && user?.planExpiresAt)
    ? Math.ceil((new Date(user.planExpiresAt) - new Date()) / 864e5)
    : null;
  const showRenewalReminder = daysToExpiry != null && daysToExpiry <= 30 && daysToExpiry >= 0;
```

to:

```js
  const planTier  = user?.planTier || 'free'; // 'free' | 'trial' | 'annual' | 'lifetime'
  const initials  = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // On-site expiry reminder — annual Pro or an active trial, within 30 days
  // of expiry (a trial is normally only a few days long, so this fires
  // almost immediately for one, which is the point). Lifetime members never
  // expire, so this never applies to them.
  const daysToExpiry = ((planTier === 'annual' || planTier === 'trial') && user?.planExpiresAt)
    ? Math.ceil((new Date(user.planExpiresAt) - new Date()) / 864e5)
    : null;
  const showRenewalReminder = daysToExpiry != null && daysToExpiry <= 30 && daysToExpiry >= 0;
```

- [ ] **Step 2: Add the trial badge case and generalize the reminder wording**

Change:

```jsx
              <div style={{
                display: 'inline-block',
                fontSize: '.52rem', fontWeight: 800,
                letterSpacing: '.5px', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 4,
                fontFamily: "'JetBrains Mono', monospace",
                background: planTier === 'lifetime' ? '#fff8e1' : plan === 'pro' ? '#e8f5e9' : 'var(--s2)',
                color:      planTier === 'lifetime' ? '#96690a' : plan === 'pro' ? '#1b5e20' : 'var(--muted)',
                border: '1px solid var(--border)',
              }}>
                {planTier === 'lifetime' ? '★ Lifetime' : plan === 'pro' ? '★ Pro' : 'Free'}
              </div>
            </div>
            {showRenewalReminder && (
              <a href="/pricing" onClick={() => { setOpen(false); onNavClose?.(); }}
                style={{ display: 'block', marginTop: 6, fontSize: '.62rem', fontWeight: 700, color: '#e65100', textDecoration: 'none' }}>
                ⚠ Pro expires in {daysToExpiry} day{daysToExpiry === 1 ? '' : 's'} — Renew →
              </a>
            )}
```

to:

```jsx
              <div style={{
                display: 'inline-block',
                fontSize: '.52rem', fontWeight: 800,
                letterSpacing: '.5px', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 4,
                fontFamily: "'JetBrains Mono', monospace",
                background: planTier === 'lifetime' ? '#fff8e1' : planTier === 'trial' ? '#e3f2fd' : plan === 'pro' ? '#e8f5e9' : 'var(--s2)',
                color:      planTier === 'lifetime' ? '#96690a' : planTier === 'trial' ? '#1565c0' : plan === 'pro' ? '#1b5e20' : 'var(--muted)',
                border: '1px solid var(--border)',
              }}>
                {planTier === 'lifetime' ? '★ Lifetime' : planTier === 'trial' ? '⏱ Trial' : plan === 'pro' ? '★ Pro' : 'Free'}
              </div>
            </div>
            {showRenewalReminder && (
              <a href="/pricing" onClick={() => { setOpen(false); onNavClose?.(); }}
                style={{ display: 'block', marginTop: 6, fontSize: '.62rem', fontWeight: 700, color: '#e65100', textDecoration: 'none' }}>
                ⚠ {planTier === 'trial' ? 'Trial' : 'Pro'} expires {daysToExpiry <= 0 ? 'today' : `in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}`} — {planTier === 'trial' ? 'Upgrade' : 'Renew'} →
              </a>
            )}
```

- [ ] **Step 3: Manual verification**

Sign in as a test user with an active trial (per Task 3's setup). Open the account dropdown in the Navbar: confirm the `⏱ Trial` badge appears, and confirm the "Trial expires in N day(s) — Upgrade →" line appears and links to `/pricing`. Set `plan_expires_at` to today's date (same day) directly in the database and refresh: confirm the wording changes to "Trial expires today — Upgrade →" rather than "in 0 days".

- [ ] **Step 4: Commit**

```bash
git add components/Navbar.jsx
git commit -m "feat(navbar): show trial status and expiry reminder to the signed-in user"
```

---

### Task 5: Trial-ended email

**Files:**
- Modify: `scripts/send_lifecycle_emails.mjs` (whole file is 166 lines; new email-builder function alongside the existing two at lines 58-88; new query+send block in `main()` alongside the existing two at lines 115-159)
- Modify: `scripts/schema.sql` (the `lifecycle_emails_sent.email_type` column's inline comment, line 216)

**Interfaces:**
- Consumes: `users.plan = 'trial'` and `plan_expires_at` (Task 1). Independent of Tasks 2-4 — this only reads the database directly, not through the app's UI or session logic.

- [ ] **Step 1: Add `buildTrialEndedEmail`**

In `scripts/send_lifecycle_emails.mjs`, add this function immediately after the existing `buildDay14WinbackEmail` function (which ends at line 88, just before `async function sendLifecycleEmail(...)`):

```js
function buildTrialEndedEmail({ name }) {
  const first = (name || '').trim().split(' ')[0] || 'there';
  return {
    subject: 'Your trial has ended',
    html: wrap(`
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Hi ${esc(first)},</h1>
      <p style="margin:0 0 18px;font-size:14px;color:${MUTED};line-height:1.6;">Your Pro trial has ended. If the extra tools — Proposal Studio, full screener access, and everything else Pro unlocks — were useful, you can pick up right where you left off.</p>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-top:8px;">
        <a href="https://mfcalc.getabundance.in/pricing" style="display:inline-block;padding:14px 32px;background:${BRAND};color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-.2px;">See Pro plans →</a>
      </td></tr></table>
      <p style="margin:24px 0 0;font-size:13px;color:${MUTED};line-height:1.6;border-top:1px solid #f1f5f9;padding-top:16px;">Questions about which plan fits? Just reply to this email — it comes straight to me.</p>
    `),
    text: `Hi ${first},\n\nYour Pro trial has ended. See plans at https://mfcalc.getabundance.in/pricing\n\nQuestions? Just reply to this email.\n\nAbundance Financial Services · ARN-251838`,
  };
}
```

- [ ] **Step 2: Add the trial-ended query+send block and update the final log line**

In `main()`, change the final section from:

```js
  console.log(`[lifecycle] done — nudge: ${nudgeSent} sent, ${nudgeFailed} failed · winback: ${winbackSent} sent, ${winbackFailed} failed`);
  await pool.end();
}
```

to:

```js
  // ── Trial ended: plan='trial' whose plan_expires_at has passed, one-shot ──
  const trialEndedCandidates = await pool.query(`
    SELECT u.id, u.name, u.email
    FROM users u
    WHERE u.role = 'client'
      AND u.plan = 'trial'
      AND u.plan_expires_at IS NOT NULL
      AND u.plan_expires_at <= NOW()
      AND NOT EXISTS (SELECT 1 FROM lifecycle_emails_sent l WHERE l.user_id = u.id AND l.email_type = 'trial_ended')
      AND u.email IS NOT NULL
  `);
  console.log(`[lifecycle] trial_ended candidates: ${trialEndedCandidates.rows.length}`);

  let trialEndedSent = 0, trialEndedFailed = 0;
  for (const u of trialEndedCandidates.rows) {
    try {
      await sendLifecycleEmail(pool, resendKey, u.id, u.email, 'trial_ended', buildTrialEndedEmail({ name: u.name }));
      trialEndedSent++;
    } catch (e) {
      console.error(`[lifecycle] trial_ended failed for ${u.id}:`, e.message);
      trialEndedFailed++;
    }
  }

  console.log(`[lifecycle] done — nudge: ${nudgeSent} sent, ${nudgeFailed} failed · winback: ${winbackSent} sent, ${winbackFailed} failed · trial_ended: ${trialEndedSent} sent, ${trialEndedFailed} failed`);
  await pool.end();
}
```

- [ ] **Step 3: Update `scripts/schema.sql`'s `email_type` comment**

Change:

```sql
  email_type TEXT        NOT NULL,  -- 'welcome' | 'day3_nudge' | 'day14_winback'
```

to:

```sql
  email_type TEXT        NOT NULL,  -- 'welcome' | 'day3_nudge' | 'day14_winback' | 'trial_ended'
```

- [ ] **Step 4: Manual verification**

Against a local/test database with `POSTGRES_URL` and `RESEND_KEY` set (or a dry-run read-only check first): set a test client-role user's `plan = 'trial'` and `plan_expires_at` to a past timestamp, run `node scripts/send_lifecycle_emails.mjs`, and confirm the console output reports one `trial_ended` candidate and one sent. Run it a second time immediately after: confirm `trial_ended candidates: 0` (the `lifecycle_emails_sent` dedup row now excludes them). Confirm an admin/distributor-role user with the same `plan`/`plan_expires_at` values is never selected (the `u.role = 'client'` filter excludes them).

- [ ] **Step 5: Commit**

```bash
git add scripts/send_lifecycle_emails.mjs scripts/schema.sql
git commit -m "feat(lifecycle-email): send one-shot trial-ended email"
```

---

## Self-Review Notes

- **Spec coverage:** `'trial'` plan value + correctness fix (Task 1) ✓, admin UI grant flow + badges (Task 2) ✓, session access gating (Task 3) ✓, client-facing badge + reminder (Task 4) ✓, one-shot trial-ended email (Task 5) ✓. All explicitly-out-of-scope items from the spec (no in-app resend button, no pre-expiry reminder, no repeat-trial blocking) are correctly absent from every task above.
- **A bug caught during planning, fixed by design rather than left to review:** the original spec didn't specify that `PATCH /api/admin/users` needs to *return* the computed `plan_expires_at`. Without it, Task 2's optimistic UI update would have set `plan: 'trial'` in local state while leaving a stale/missing `plan_expires_at`, making the freshly-granted trial badge immediately render as "TRIAL USED" instead of an active trial. Task 1's response shape (`planExpiresAt` field) and Task 2's `changePlan` (consuming it) are written to close this from the start.
- **Pre-existing, out-of-scope observation (not fixed by this plan):** `app/api/admin/users/route.js`'s `VALID_PLANS` already listed a `'lifetime'` value alongside `'pro_lifetime'`, but `auth.js`'s session callback only ever checks `plan === 'pro_lifetime'` for lifetime access — a user whose `plan` is literally `'lifetime'` (not `'pro_lifetime'`) would silently normalize to `'free'`. This is a pre-existing latent inconsistency unrelated to the trial feature; worth a look separately, not addressed here to avoid unrelated scope creep.
- **Type consistency:** `planTier` values (`'free' | 'trial' | 'annual' | 'lifetime'`) are consistent across Task 3 (producer) and Task 4 (consumer). `plan_expires_at`/`planExpiresAt` naming: the raw DB/API field is `plan_expires_at` (snake_case, Task 1/2's SQL and `UsersTab.jsx` local state), while the session/JS-facing field is `planExpiresAt` (camelCase, `auth.js`/`Navbar.jsx`) — this mirrors the naming convention the existing annual-Pro code already used before this plan touched anything, not a new inconsistency.
