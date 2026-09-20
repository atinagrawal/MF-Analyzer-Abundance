import React from 'react';
import EmbedBreadthWrapper from './EmbedBreadthClient';

export const metadata = {
  title: 'Nifty 50 Advance/Decline Breadth Ticker Widget | Abundance',
  description: 'Live Nifty 50 market breadth ticker and advance/decline ratio widget. Embed free on your financial blog or website.',
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: 'https://mfcalc.getabundance.in/market-breadth',
  },
};

export default function EmbedBreadthPage() {
  return <EmbedBreadthWrapper />;
}
