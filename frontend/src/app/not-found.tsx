import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-wave-soft px-4 text-center">
      <BrandMark className="mb-4 h-12 w-12" />
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">The page you were looking for does not exist.</p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
