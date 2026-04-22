/**
 * app/robots.js — Dynamic robots.txt generation
 * Next.js serves this at /robots.txt
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/admin/', '/login'],
      },
    ],
    sitemap: 'https://mfcalc.getabundance.in/sitemap.xml',
    host: 'https://mfcalc.getabundance.in',
  };
}
