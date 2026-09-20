import React from 'react';
import EmbedSipWrapper from './EmbedSipClient';

export const metadata = {
  title: 'SIP Calculator Embeddable Widget | Abundance',
  description: 'Interactive SIP and Step-Up Mutual Fund Calculator widget. Embed free on your financial blog or website.',
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: 'https://mfcalc.getabundance.in/sip-calculator',
  },
};

export default function EmbedSipPage() {
  return <EmbedSipWrapper />;
}
