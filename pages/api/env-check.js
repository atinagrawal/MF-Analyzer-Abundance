// pages/api/env-check.js
// Temporary route to verify required env vars are present.
// DELETE THIS FILE after confirming everything is set.
// Never exposes values — only checks presence (true/false).

export default function handler(req, res) {
  const vars = {
    // Postgres (auto-added by Vercel Postgres integration)
    POSTGRES_URL:              !!process.env.POSTGRES_URL,
    POSTGRES_URL_NON_POOLING:  !!process.env.POSTGRES_URL_NON_POOLING,
    POSTGRES_PRISMA_URL:       !!process.env.POSTGRES_PRISMA_URL,
    POSTGRES_USER:             !!process.env.POSTGRES_USER,
    POSTGRES_HOST:             !!process.env.POSTGRES_HOST,
    POSTGRES_PASSWORD:         !!process.env.POSTGRES_PASSWORD,
    POSTGRES_DATABASE:         !!process.env.POSTGRES_DATABASE,
    // Auth (manually added)
    NEXTAUTH_SECRET:           !!process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL:              !!process.env.NEXTAUTH_URL,
    GOOGLE_CLIENT_ID:          !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET:      !!process.env.GOOGLE_CLIENT_SECRET,
    // Existing (should already be set)
    BLOB_READ_WRITE_TOKEN:     !!process.env.BLOB_READ_WRITE_TOKEN,
  };

  const allSet = Object.values(vars).every(Boolean);
  const missing = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);

  res.status(200).json({ allSet, missing, vars });
}
