// app/api/revalidate/route.js — on-demand cache purge for statically-generated
// data routes, called by the nightly GitHub Actions job right after it
// successfully repopulates Postgres. Without this, /api/screener's build-time
// ISR snapshot can serve stale data for up to its full revalidate window
// (6h) even after the database is fixed -- this was the confusing part of
// an Aug 2026 incident, where the DB was already correct but the live site
// wasn't until a manual redeploy.
import { revalidatePath } from 'next/cache';

export async function POST(req) {
  const secret = req.headers.get('x-revalidate-secret');
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  revalidatePath('/api/screener');
  revalidatePath('/api/sif-nav');
  return Response.json({ revalidated: true, paths: ['/api/screener', '/api/sif-nav'] });
}
