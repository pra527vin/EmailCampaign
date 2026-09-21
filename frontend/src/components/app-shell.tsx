'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { BrandLockup } from '@/components/brand-mark';
import { Glyph, type GlyphName } from '@/components/icons';
import type { User } from '@/lib/types';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/lists', label: 'Recipients', icon: 'lists' },
  { href: '/templates', label: 'Templates', icon: 'templates' },
  { href: '/campaigns', label: 'Campaigns', icon: 'campaigns' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: GlyphName }>;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ user: User }>('/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        // The cookie is gone or the session was revoked server-side.
        router.replace('/login');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  // While the drawer covers the page, lock the body and honour Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  async function handleLogout() {
    await api.post('/auth/logout').catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  const nav = (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={clsx('nav-link', active && 'nav-link-active')}
          >
            <Glyph name={item.icon} className="shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  // Initials rather than a photo: there is no avatar in the data model, and a
  // gradient monogram is what the reference uses.
  const initials = (user?.name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const account = (
    <div className="border-t border-white/[0.09] px-5 pb-5 pt-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-brand-600 text-xs font-bold text-white"
        >
          {initials || ' '}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-white">{user?.name ?? '…'}</p>
          <p className="truncate text-xs text-[#B4C4D1]">{user?.email ?? ''}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        className="w-full rounded-lg border border-white/[0.18] bg-transparent p-2 text-xs font-semibold text-[#DCE6EE] transition hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400"
      >
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      {/* A dark rail rather than a light one: it separates chrome from content
          without a border, and lets the page itself stay quiet. Sticky and full
          height, so navigation never scrolls out of reach on a long table. */}
      {/* A dark rail rather than a light one: it separates chrome from content
          without a border, and lets the page itself stay quiet. Sticky and full
          height, so navigation never scrolls out of reach on a long table. */}
      <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 flex-col justify-between bg-slate-950 lg:flex">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-5 pb-[26px] pt-[22px]">
            <BrandLockup onDark />
          </div>
          <div className="px-3">{nav}</div>
        </div>
        {account}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header. The gradient hairline ties every screen to the logo. */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="h-0.5 bg-brand-wave" />
          <div className="flex items-center justify-between px-4 py-3">
            <BrandLockup size="sm" />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-label="Open navigation"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-current">
                <path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] animate-fade-in flex-col bg-slate-950 shadow-xl">
              <div className="flex items-center justify-between px-4 py-4">
                <BrandLockup size="sm" onDark />
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close navigation"
                  className="rounded-lg px-2 py-1 text-xl leading-none text-[#B4C4D1] transition hover:bg-white/10 hover:text-white"
                >
                  &times;
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3">{nav}</div>
              {account}
            </div>
          </div>
        )}

        {/* The reference's 30/34/56 padding from `lg` up, where its sidebar
            exists; tighter below that, because 34px of gutter on a 320px phone
            is a fifth of the screen. The cap keeps a 2560px monitor from
            stretching tables to an unreadable line length -- the reference is
            drawn at 1440 and says nothing about what happens past that. */}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-[34px] lg:pb-14 lg:pt-[30px]">
          <div className="mx-auto w-full max-w-[1880px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
