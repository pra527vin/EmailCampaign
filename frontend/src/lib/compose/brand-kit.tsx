'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { BrandKit } from './types';

/**
 * Brand defaults every block can point at.
 *
 * Kept in the browser rather than on the server: this is a composing
 * convenience, not campaign data. What ships is the template it helped
 * produce, and that is saved properly. Losing the kit costs a few colour
 * pickers, not any sent mail.
 */

const STORAGE_KEY = 'mailstrive-compose-brand-v1';

export const DEFAULT_BRAND: BrandKit = {
  brandName: 'Your brand',
  primaryColor: '#0E5AA7',
  textColor: '#0F1B2A',
  mutedColor: '#5C6E80',
  backgroundColor: '#F5F7FA',
  fontFamily: 'Helvetica, Arial, sans-serif',
  customFonts: [],
};

interface BrandKitValue {
  brand: BrandKit;
  updateBrand: (patch: Partial<BrandKit>) => void;
}

const BrandKitContext = createContext<BrandKitValue | null>(null);

export function BrandKitProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandKit>(DEFAULT_BRAND);

  // Nothing is written back until the stored kit has been read, so a first
  // render never overwrites a saved kit with the defaults.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setBrand({ ...DEFAULT_BRAND, ...(JSON.parse(raw) as Partial<BrandKit>) });
    } catch {
      // A blocked or corrupt store just means the defaults stand.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(brand));
    } catch {
      // Private windows refuse the write; the kit still works for this session.
    }
  }, [brand, loaded]);

  const updateBrand = useCallback((patch: Partial<BrandKit>) => {
    setBrand((current) => ({ ...current, ...patch }));
  }, []);

  const value = useMemo(() => ({ brand, updateBrand }), [brand, updateBrand]);

  return <BrandKitContext.Provider value={value}>{children}</BrandKitContext.Provider>;
}

export function useBrandKit(): BrandKitValue {
  const context = useContext(BrandKitContext);
  if (!context) throw new Error('useBrandKit must be used within BrandKitProvider');
  return context;
}
