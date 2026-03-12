/**
 * /api/health
 * Simple health check — confirms API routes are working.
 */

export const config = { runtime: 'edge' };

export default async function handler(req) {
  return new Response(JSON.stringify({
    status: 'ok',
    service: 'Abundance MF Calculator API',
    arn: 'ARN-251838',
    timestamp: new Date().toISOString(),
    routes: [
      '/api/health',
      '/api/amfi-pdf?month=feb&year=2026',
      '/api/amfi-industry?month=feb&year=2026'
    ]
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
