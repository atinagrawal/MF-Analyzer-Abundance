import { getPageMeta } from '@/lib/metadata';

// Portfolio page is always private — no indexing
export const metadata = {
  title: 'My Portfolio — Abundance Financial Services',
  description: 'Your personal mutual fund portfolio dashboard. Live NAVs, wealth summary, and holdings analysis.',
  robots: { index: false, follow: false },
};

export default function PortfolioLayout({ children }) {
  return children;
}
