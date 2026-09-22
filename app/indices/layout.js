import { getPageMeta } from '@/lib/metadata';

export const metadata = getPageMeta('indices', {
  other: {
    'link:alternate': 'https://mfcalc.getabundance.in/indices?format=md',
  },
});

export default function IndicesLayout({ children }) {
  return children;
}
