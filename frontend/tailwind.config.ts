import type { Config } from 'tailwindcss';

/**
 * The design system, taken from the Flomerz Mail reference.
 *
 * Two decisions shape this file:
 *
 * 1. The neutral ramp REPLACES Tailwind's `slate`. The reference has its own
 *    cool-grey ladder -- #0F1B2A text through #F5F7FA page -- and the app
 *    already reaches for `slate-*` in 260 places. Redefining the ramp snaps
 *    every one of those to the reference instead of rewriting them, and keeps
 *    a single neutral vocabulary rather than two competing ones.
 *
 * 2. `--type-scale` still drives the type sizes, so the responsive step set in
 *    `globals.css` survives. The base values below are the reference's own
 *    sizes, so at scale 1 the app renders exactly what the mockup shows.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /** Cool neutrals. Text at the dark end, surfaces at the light end. */
        slate: {
          50: '#FAFBFC', // subtle surface: table headers, inset panels
          100: '#F1F4F8', // muted fill: chips, segmented controls, dividers
          200: '#E3E8EE', // card border
          300: '#D6DEE7', // control border
          400: '#6B7B8C', // tertiary text
          500: '#5C6E80', // secondary text
          600: '#4A5C6E',
          700: '#33475B', // body text on light fills
          800: '#1E2E40',
          900: '#0F1B2A', // primary text
          950: '#0B2436', // sidebar
        },
        /** Primary action blue. */
        brand: {
          50: '#EAF2FB',
          100: '#D2E3F5',
          200: '#B0CDEB',
          300: '#7FAEDC',
          400: '#4B87C7',
          500: '#2470B4',
          600: '#0E5AA7',
          700: '#0A4685',
          800: '#0B3A6C',
          900: '#24455F',
          950: '#0B2436',
        },
        /** Success / delivered. */
        accent: {
          50: '#E8F6EE',
          100: '#CDEBDA',
          200: '#A3DBBC',
          300: '#6FC697',
          400: '#3FB075',
          500: '#1E9E5A',
          600: '#1E8A52',
          700: '#14663B',
          800: '#12512F',
          900: '#0F4228',
        },
        /** The logo's leaf green, used on the dark sidebar and for highlights. */
        lime: {
          50: '#F3F6D9',
          100: '#E8EFC0',
          200: '#D3E49B',
          300: '#B6DA7E',
          400: '#8FD46A',
          500: '#7FC65B',
          600: '#5FA53F',
          700: '#6E7A0D',
          800: '#575F13',
          900: '#464C16',
        },
        /** Failure. Tailwind's red is too saturated beside these neutrals. */
        red: {
          50: '#FBECEB',
          100: '#F6DBD9',
          200: '#F0D3D1',
          300: '#E3B6B3',
          400: '#D4756E',
          500: '#C8322B',
          600: '#B62B25',
          700: '#8E2521',
          800: '#7A3431',
          900: '#5E201D',
        },
        /** Bounces and soft warnings. */
        amber: {
          50: '#FDF3E2',
          100: '#F9E8CA',
          200: '#F2DFBD',
          300: '#EBC684',
          400: '#E0A93B',
          500: '#C98F20',
          600: '#A87418',
          700: '#8A5A05',
          800: '#6E4808',
          900: '#573A0C',
        },
        /** Unsubscribes. */
        purple: {
          50: '#F5EEF8',
          100: '#EADDF0',
          200: '#DCC8E6',
          300: '#B48BC4',
          400: '#9C6DAF',
          500: '#845596',
          600: '#6D447C',
          700: '#573763',
          800: '#442B4D',
          900: '#35213C',
        },
        teal: {
          50: '#E6F4F7',
          100: '#C7E6ED',
          200: '#9CD3DF',
          300: '#63B8CA',
          400: '#3699AF',
          500: '#1F7C93',
          600: '#1A6478',
          700: '#17525F',
          800: '#16434E',
          900: '#143842',
        },
      },
      backgroundImage: {
        'brand-wave': 'linear-gradient(100deg, #1E9E5A 0%, #8FD46A 38%, #3699AF 70%, #0E5AA7 100%)',
        'brand-wave-soft': 'linear-gradient(160deg, #F5F7FA 0%, #EAF2FB 55%, #E8F6EE 100%)',
      },
      /**
       * The reference's type ladder, to the half-pixel.
       *
       * The slot names are chosen so the sizes the app already reaches for land
       * on the sizes the reference specifies: `sm` is its 13.5px body, `xs` its
       * 12.5px secondary text, `2xs` the 11.5px uppercase column headers.
       *
       * `--type-scale` is kept as a single multiplier. It is 1, so the app now
       * renders at the reference's density; raising it in `globals.css` scales
       * all text together if that turns out to be too small in practice.
       */
      fontSize: {
        '2xs': ['calc(11.5px*var(--type-scale))', { lineHeight: 'calc(15px*var(--type-scale))' }],
        xs: ['calc(12.5px*var(--type-scale))', { lineHeight: 'calc(17px*var(--type-scale))' }],
        sm: ['calc(13.5px*var(--type-scale))', { lineHeight: 'calc(19.5px*var(--type-scale))' }],
        base: ['calc(14.5px*var(--type-scale))', { lineHeight: 'calc(21px*var(--type-scale))' }],
        lg: ['calc(16px*var(--type-scale))', { lineHeight: 'calc(23px*var(--type-scale))' }],
        xl: ['calc(20px*var(--type-scale))', { lineHeight: 'calc(26px*var(--type-scale))' }],
        '2xl': ['calc(24px*var(--type-scale))', { lineHeight: 'calc(30px*var(--type-scale))' }],
        '3xl': ['calc(28px*var(--type-scale))', { lineHeight: 'calc(34px*var(--type-scale))' }],
        '4xl': ['calc(32px*var(--type-scale))', { lineHeight: 'calc(38px*var(--type-scale))' }],
        '5xl': ['calc(40px*var(--type-scale))', { lineHeight: '1' }],
        '6xl': ['calc(48px*var(--type-scale))', { lineHeight: '1' }],
      },
      /**
       * The fallback inside `var()` is not decoration.
       *
       * An undefined custom property makes the whole `font-family` declaration
       * invalid at computed-value time -- the names listed after it do not get
       * a turn, and the page renders in the browser's serif default. So the
       * family name is repeated inside the `var()` as well as after it.
       */
      fontFamily: {
        sans: ["var(--font-sans, 'Plus Jakarta Sans')", 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ["var(--font-mono, 'IBM Plex Mono')", 'IBM Plex Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
      /**
       * Three radii, and the app's existing vocabulary maps onto them: every
       * `rounded-lg` in the codebase is a control and every `rounded-xl` is a
       * card, so redefining those two is enough. The 8px primary button is the
       * one exception and asks for it explicitly.
       */
      borderRadius: {
        md: '6px', // segmented control
        lg: '7px', // inputs, secondary and small buttons
        xl: '12px', // cards
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,27,42,0.04)',
        'card-hover': '0 2px 4px rgba(15,27,42,0.06), 0 8px 20px -8px rgba(15,27,42,0.14)',
        segment: '0 1px 2px rgba(15,27,42,0.12)',
        primary: '0 1px 2px rgba(14,90,167,0.3)',
        focus: '0 0 0 3px rgba(14,90,167,0.12)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(-8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
        'scale-in': 'scale-in 0.16s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
