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
          '/api/nfo',
          '/llms.txt',
          '/llms-full.txt',
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
      // Explicit Generative Engine Optimization (GEO): Allow AI search & retrieval agents
      {
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'OAI-SearchBot',
          'PerplexityBot',
          'ClaudeBot',
          'anthropic-ai',
          'Claude-Web',
          'Google-Extended',
          'Applebot-Extended',
          'cohere-ai',
          'Meta-ExternalAgent',
        ],
        allow: [
          '/',
          '/nfo',
          '/nfo/',
          '/sifs',
          '/screener',
          '/articles/',
          '/pioneers',
          '/api/nfo',
          '/llms.txt',
          '/llms-full.txt',
        ],
        disallow: [
          '/admin',
          '/admin/',
          '/login',
          '/api/admin/',
          '/api/auth/',
          '/api/checkout/',
        ],
      },
    ],
    sitemap: [
      'https://mfcalc.getabundance.in/sitemap.xml',
      'https://mfcalc.getabundance.in/sitemap-funds.xml',
      'https://mfcalc.getabundance.in/sitemap-pms.xml',
      'https://mfcalc.getabundance.in/sitemap-nfo.xml',
    ],
    host: 'https://mfcalc.getabundance.in',
  };
}
