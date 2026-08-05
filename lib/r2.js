/**
 * lib/r2.js
 *
 * Thin Cloudflare R2 client for this app's user-uploaded/saved JSON payloads
 * (CAS portfolios, saved proposals) -- replaces the @vercel/blob usage those
 * two features previously relied on, after Vercel Blob's free-tier quota was
 * exhausted. R2 speaks the S3 API, signed here with aws4fetch (a ~2KB,
 * zero-dependency SigV4 signer Cloudflare itself recommends for R2 from
 * Node/Workers) rather than pulling in the full @aws-sdk/client-s3 tree.
 *
 * Unlike Vercel Blob (which needed a list({prefix}) round-trip even for an
 * exact known key, since put() could append a random suffix), R2/S3 keys
 * are exact and addressable directly -- put/get/delete-by-key, no listing
 * step needed. This also means the callers here are simpler than their
 * @vercel/blob-based predecessors.
 *
 * Required env vars (set in Vercel: Project -> Settings -> Environment
 * Variables, matching whatever bucket/token you create in the Cloudflare
 * dashboard -- see the R2 setup notes in the repo's operational docs):
 *   R2_ACCOUNT_ID       -- Cloudflare account ID (shown in the R2 dashboard)
 *   R2_ACCESS_KEY_ID    -- R2 API token's Access Key ID
 *   R2_SECRET_ACCESS_KEY -- R2 API token's Secret Access Key
 *   R2_BUCKET_NAME      -- the bucket these payloads are stored in
 */

import { AwsClient } from 'aws4fetch';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured -- see lib/r2.js header comment for required env vars`);
  return value;
}

function endpointFor(key) {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const bucket = requireEnv('R2_BUCKET_NAME');
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
}

function client() {
  return new AwsClient({
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  });
}

async function r2Put(key, jsonString) {
  const res = await client().fetch(endpointFor(key), {
    method: 'PUT',
    body: jsonString,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`R2 put failed for ${key}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }
}

// Returns the parsed JSON payload, or null if the key doesn't exist.
async function r2Get(key) {
  const res = await client().fetch(endpointFor(key), { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`R2 get failed for ${key}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }
  return res.json();
}

// A missing key is treated as already-deleted, not an error.
async function r2Delete(key) {
  const res = await client().fetch(endpointFor(key), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed for ${key}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }
}

export { r2Put, r2Get, r2Delete };
