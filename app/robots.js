/**
 * app/robots.js — Dynamic robots.txt generation
 * Next.js serves this at /robots.txt
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/api/fund-detail/',
          '/api/sif-detail/',
          '/api/pms-detail/',
          '/api/scheme-master-facts',
          '/api/nifty-tri',
          '/api/bse-index',
          '/api/screener',
          '/api/sif-screener',
          '/api/proposal-studio/holdings',
          '/api/sif-history',
        ],
        disallow: [
          '/admin',
          '/admin/',
          '/login',
          '/proposal-studio/view/',
          '/api/admin/',
          '/api/auth/',
          '/api/checkout/',
          '/api/cas/',
          '/api/holdings',
          '/api/proposal-studio/save',
          '/api/proposal-studio/delete',
          '/api/user/',
          '/api/webhooks/',
        ],
      },
    ],
    sitemap: [
      'https://mfcalc.getabundance.in/sitemap.xml',
      'https://mfcalc.getabundance.in/sitemap-funds.xml',
      'https://mfcalc.getabundance.in/sitemap-pms.xml',
    ],
    host: 'https://mfcalc.getabundance.in',
  };
}
