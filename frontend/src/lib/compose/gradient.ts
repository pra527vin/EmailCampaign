/**
 * Linear gradients, and the solid colour that stands in for one.
 *
 * Several mail clients -- desktop Outlook among them -- render no gradient at
 * all. Every background therefore ships as a solid declaration first and the
 * gradient second, so a client that cannot read the second keeps the first.
 * `firstColor` is what that fallback is picked from.
 */

export interface Gradient {
  angle: number;
  from: string;
  to: string;
}

const DEFAULT_GRADIENT: Gradient = { angle: 135, from: '#3D5AFE', to: '#7C5CFF' };

export function isGradient(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('linear-gradient');
}

export function parseGradient(value: string | undefined): Gradient {
  if (typeof value === 'string') {
    const match = value.match(/linear-gradient\(\s*([\d.]+)deg\s*,\s*([^,]+),\s*([^)]+)\)/i);
    if (match?.[1] && match[2] && match[3]) {
      return { angle: Number(match[1]), from: match[2].trim(), to: match[3].trim() };
    }
  }
  return { ...DEFAULT_GRADIENT };
}

export function buildGradient({ angle, from, to }: Gradient): string {
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

/** The solid colour a client without gradient support should fall back to. */
export function firstColor(value: string): string {
  if (!isGradient(value)) return value;
  const match = value.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/);
  return match ? match[0] : '#000000';
}
