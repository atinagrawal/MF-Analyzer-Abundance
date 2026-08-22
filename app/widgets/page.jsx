import WidgetsClient from './WidgetsClient';
import { getPageMeta } from '@/lib/metadata';

export const metadata = getPageMeta('widgets');

export default function WidgetsPage() {
  return <WidgetsClient />;
}
