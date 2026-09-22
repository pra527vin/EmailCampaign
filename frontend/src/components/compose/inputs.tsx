'use client';

import clsx from 'clsx';
import { AlignCenter, AlignLeft, AlignRight, ArrowRight, Check, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { useResolvedImage } from '@/components/compose/use-resolved-image';
import { useBrandKit } from '@/lib/compose/brand-kit';
import { allFonts, googleUrlFor, toStack } from '@/lib/compose/fonts';
import { buildGradient, firstColor, isGradient, parseGradient } from '@/lib/compose/gradient';
import { normalizeImageUrl } from '@/lib/compose/image-url';
import type { Align } from '@/lib/compose/types';

/**
 * The controls the settings panel is built from.
 *
 * These are denser than the app's form primitives on purpose -- a settings
 * rail holds twenty controls in the width a form gives to two -- but they are
 * drawn entirely in the app's own tokens, so the composer reads as part of
 * MailStrive rather than as a tool that was bolted onto it.
 */

export const FIELD_LABEL =
  'mb-1.5 block text-2xs font-bold uppercase tracking-[0.12em] text-slate-400';
export const CONTROL =
  'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 ' +
  'transition placeholder:text-slate-400 hover:border-[#B9C6D2] focus:border-brand-600 ' +
  'focus:shadow-focus focus:outline-none';
export const BTN_PRIMARY =
  'rounded-lg bg-brand-600 px-3 py-2 text-2xs font-bold text-white transition-colors hover:bg-brand-700';
export const BTN_GHOST =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-2xs font-semibold text-slate-700 ' +
  'transition-colors hover:border-slate-400 hover:bg-slate-50';
export const BTN_DASHED =
  'flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 ' +
  'py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-600 hover:text-brand-700';
export const BTN_ICON =
  'flex h-8 w-8 flex-none items-center justify-center rounded-lg text-slate-500 ' +
  'transition-colors hover:bg-slate-100 hover:text-slate-900';
export const CARD = 'rounded-xl border border-slate-200 bg-white p-3';
export const HINT = 'text-2xs leading-relaxed text-slate-500';
export const SECTION_TITLE = 'text-2xs font-bold uppercase tracking-[0.12em] text-slate-400';

/** A segmented pill, used by every two- or three-way choice in the panel. */
const SEGMENT = 'inline-flex rounded-lg border border-slate-300 bg-white p-0.5';
const segmentButton = (active: boolean): string =>
  clsx(
    'rounded-[6px] px-3 py-1 text-2xs font-semibold transition-colors',
    active ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100',
  );

/**
 * The slider fill is driven by a CSS custom property, which `CSSProperties`
 * has no room for -- hence the cast, kept in one place rather than at each
 * call site.
 */
function rangeStyle(pct: number): CSSProperties {
  return { '--pct': `${pct}%` } as unknown as CSSProperties;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="mb-[18px] block">
      <span className={FIELD_LABEL}>{label}</span>
      {children}
      {hint ? <span className={`mt-1.5 block ${HINT}`}>{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  onKeyDown,
  onBlur,
  autoFocus,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      autoFocus={autoFocus}
      className={CONTROL}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value ?? ''}
      placeholder={placeholder}
      rows={rows}
      onChange={(event) => onChange(event.target.value)}
      className={`${CONTROL} resize-none`}
    />
  );
}

/**
 * A slider with a typed value beside it.
 *
 * In a half-width column there is no room for both, so `compact` drops the
 * slider rather than letting the two overlap.
 */
export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
  compact,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  compact?: boolean;
}) {
  const box = (
    <div
      className={clsx(
        'flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 focus-within:border-brand-600',
        compact ? 'w-full' : 'w-[76px] flex-none',
      )}
    >
      <input
        type="number"
        value={value ?? 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full min-w-0 bg-transparent text-xs text-slate-900 focus:outline-none"
      />
      {suffix ? <span className="flex-none text-2xs text-slate-400">{suffix}</span> : null}
    </div>
  );

  if (compact) return box;

  const pct = max > min ? ((Math.min(max, Math.max(min, value ?? 0)) - min) / (max - min)) * 100 : 0;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className="compose-range min-w-0 flex-1"
        style={rangeStyle(pct)}
      />
      {box}
    </div>
  );
}

/** Six-digit hex for `<input type="color">`, which accepts nothing else. */
function toHex(value: string | undefined): string {
  if (!value) return '#ffffff';
  if (value.startsWith('#')) {
    return value.length === 4
      ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
      : value;
  }
  return '#ffffff';
}

export function ColorInput({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-slate-300">
        <span className="sr-only">Pick a colour</span>
        <input
          type="color"
          value={toHex(value)}
          onChange={(event) => onChange(event.target.value)}
          className="absolute -left-1 -top-1 h-11 w-11 cursor-pointer border-0 p-0"
        />
      </label>
      <input
        type="text"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className={CONTROL}
      />
    </div>
  );
}

/**
 * Solid colour or gradient, in one control.
 *
 * Gradients are stored as the CSS string itself rather than as parts, so a
 * value can always be handed straight to the exporter -- which pairs it with a
 * solid fallback for the clients that cannot render one.
 */
export function BackgroundInput({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const gradient = isGradient(value);
  const parsed = parseGradient(
    gradient ? value : buildGradient({ angle: 135, from: value || '#3D5AFE', to: '#7C5CFF' }),
  );

  const updateGradient = (patch: Partial<typeof parsed>): void =>
    onChange(buildGradient({ ...parsed, ...patch }));

  return (
    <div>
      <div className={`mb-2 ${SEGMENT}`}>
        <button
          type="button"
          onClick={() => onChange(firstColor(value ?? '') || '#3D5AFE')}
          className={segmentButton(!gradient)}
        >
          Solid
        </button>
        <button
          type="button"
          onClick={() => onChange(buildGradient(parsed))}
          className={segmentButton(gradient)}
        >
          Gradient
        </button>
      </div>

      {!gradient ? (
        <ColorInput value={value} onChange={onChange} />
      ) : (
        <div className="space-y-2.5">
          <div
            className="h-9 w-full rounded-lg border border-slate-300"
            style={{ background: buildGradient(parsed) }}
          />
          <div className="grid grid-cols-2 gap-2">
            <ColorInput value={parsed.from} onChange={(v) => updateGradient({ from: v })} />
            <ColorInput value={parsed.to} onChange={(v) => updateGradient({ to: v })} />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={360}
              value={parsed.angle}
              aria-label="Gradient angle"
              onChange={(event) => updateGradient({ angle: Number(event.target.value) })}
              className="compose-range min-w-0 flex-1"
              style={rangeStyle((parsed.angle / 360) * 100)}
            />
            <span className="w-12 shrink-0 text-right text-2xs text-slate-500">
              {parsed.angle}&deg;
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function SelectInput<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className={`${CONTROL} cursor-pointer`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function AlignInput({
  value,
  onChange,
}: {
  value: Align;
  onChange: (value: Align) => void;
}) {
  const options = [
    { v: 'left' as const, Icon: AlignLeft, label: 'Left' },
    { v: 'center' as const, Icon: AlignCenter, label: 'Centre' },
    { v: 'right' as const, Icon: AlignRight, label: 'Right' },
  ];

  return (
    <div className={SEGMENT}>
      {options.map(({ v, Icon, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-label={label}
          aria-pressed={value === v}
          className={clsx(
            'flex h-8 w-10 items-center justify-center rounded-[6px] transition-colors',
            value === v ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100',
          )}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}

/**
 * The switch sits at the start of the row, beside its own state, rather than
 * floating off at the panel edge away from the label above it.
 */
export function ToggleInput({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(value)}
      onClick={() => onChange(!value)}
      className="flex items-center gap-2.5 text-left"
    >
      <span
        className={clsx(
          'relative h-[22px] w-10 flex-none rounded-full transition-colors',
          value ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span
          className={clsx(
            'absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform',
            value ? 'translate-x-[18px]' : 'translate-x-0',
          )}
        />
      </span>
      <span className="text-xs text-slate-700">{label ?? (value ? 'On' : 'Off')}</span>
    </button>
  );
}

/* -- Image source: paste a URL, or upload a small file --------------------- */

const MAX_UPLOAD_BYTES = 200 * 1024;

/**
 * Where a block's picture comes from.
 *
 * The typed value is held apart from the committed one until Insert is
 * pressed, so pasting a link previews it without silently changing the block
 * -- the moment a URL enters the email is explicit. The preview resolves the
 * draft through the same path the canvas uses, so what is seen before
 * inserting is what appears after.
 */
export function ImageSourceInput({
  value,
  onChange,
  placeholder = 'Image URL',
  accept = 'image/png,image/svg+xml,image/jpeg,image/gif,image/webp',
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  accept?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(value ?? '');
  const [justInserted, setJustInserted] = useState(false);
  const insertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A change from outside this field -- an upload, Clear, or another control
  // setting the block's image -- replaces the draft so the two never disagree.
  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  useEffect(
    () => () => {
      if (insertTimer.current) clearTimeout(insertTimer.current);
    },
    [],
  );

  const committed = String(value ?? '').trim();
  const draftTrimmed = draft.trim();
  const dirty = draftTrimmed !== committed;

  const { status, imgProps, imgKey, viaServer } = useResolvedImage(draft);

  const insert = (): void => {
    setError('');
    const clean = normalizeImageUrl(draft);
    setDraft(clean);
    onChange(clean);
    setJustInserted(true);
    if (insertTimer.current) clearTimeout(insertTimer.current);
    insertTimer.current = setTimeout(() => setJustInserted(false), 2400);
  };

  const pick = (file: File | undefined): void => {
    if (!file) return;
    setError('');

    // Large embedded images get clipped by Gmail, so the limit is a
    // deliverability guard rather than a storage one.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        'That file is over 200KB. Host it and paste the URL instead — large embedded images get clipped by Gmail.',
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result ?? ''));
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsDataURL(file);
  };

  const isDraftData = draft.startsWith('data:');
  const canInsert = draftTrimmed.length > 0 && dirty;

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-1.5">
        <div className="min-w-0 flex-1">
          <TextInput
            value={isDraftData ? '' : draft}
            placeholder={isDraftData ? 'Uploaded file' : placeholder}
            onChange={(v) => {
              setError('');
              setDraft(v);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canInsert) {
                event.preventDefault();
                insert();
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={insert}
          disabled={!canInsert}
          title="Add this URL to the HTML"
          className={clsx(
            'flex flex-none items-center gap-1.5 rounded-lg px-3 text-2xs font-bold transition-colors',
            canInsert
              ? 'bg-brand-600 text-white hover:bg-brand-700'
              : 'cursor-not-allowed bg-slate-100 text-slate-400',
          )}
        >
          {justInserted && !dirty ? <Check size={13} /> : <ArrowRight size={13} />}
          Insert
        </button>
      </div>

      {dirty && draftTrimmed ? (
        <span className="block text-2xs font-semibold text-brand-700">
          Not added yet &mdash; click Insert (or press Enter) to put this URL in the HTML.
        </span>
      ) : null}
      {justInserted && !dirty ? (
        <span className="flex items-center gap-1 text-2xs font-semibold text-accent-600">
          <Check size={12} /> Inserted &mdash; this URL is now in the HTML.
        </span>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`flex items-center gap-1.5 ${BTN_GHOST}`}
        >
          <Upload size={12} /> Upload PNG / SVG
        </button>
        {value ? (
          <>
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-slate-300 bg-[repeating-conic-gradient(#F1F4F8_0%_25%,#fff_0%_50%)] bg-[length:10px_10px]">
              {/* A plain <img>, not next/image: the source is an arbitrary
                  remote URL (sometimes proxied through this app), which the
                  optimiser cannot take. */}
              <img key={imgKey} {...imgProps} alt="" className="max-h-6 max-w-6 object-contain" />
            </span>
            <button
              type="button"
              onClick={() => {
                setError('');
                onChange('');
              }}
              title="Clear"
              className={`${BTN_ICON} hover:bg-red-50 hover:text-red-600`}
            >
              <X size={13} />
            </button>
          </>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>

      {error ? <span className="block text-2xs text-red-600">{error}</span> : null}
      {!error && status === 'error' ? (
        <span className="block text-2xs leading-relaxed text-red-600">
          That link could not be loaded as an image, even through this app&rsquo;s server. It usually
          means the URL points at a page rather than at the file itself, or the host needs a sign-in.
          Uploading the file always works.
        </span>
      ) : null}
      {!error && status === 'loading' ? (
        <span className={`block ${HINT}`}>Loading the image&hellip;</span>
      ) : null}
      {!error && status === 'ok' && viaServer ? (
        <span className={`block ${HINT}`}>
          That host blocks other sites from loading its images, so the composer fetches it through
          this app to show you the artwork. The email keeps your original link &mdash; check it
          renders where it will be read.
        </span>
      ) : null}
    </div>
  );
}

/* -- Font picker ----------------------------------------------------------- */

export function FontInput({
  value,
  onChange,
  allowInherit = true,
  inheritLabel = 'Brand Kit font',
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  allowInherit?: boolean;
  inheritLabel?: string;
}) {
  const { brand, updateBrand } = useBrandKit();
  const fonts = allFonts(brand);
  const [custom, setCustom] = useState(false);
  const [family, setFamily] = useState('');
  const [url, setUrl] = useState('');

  const known = fonts.some((font) => font.stack === value);
  const groups = ['Email-safe', 'Web fonts', 'Custom'] as const;

  /**
   * Adding a custom font registers it on the Brand Kit rather than on the
   * block, so its stylesheet loads on the canvas, it appears in every other
   * block's picker, and the exported email links to it.
   */
  const addCustom = (): void => {
    const label = family.trim();
    if (!label) return;

    const stack = toStack(label);
    const existing = brand.customFonts.find((font) => font.stack === stack);

    if (!existing) {
      updateBrand({
        customFonts: [
          ...brand.customFonts,
          { id: `font-${Date.now()}`, label, stack, url: url.trim() },
        ],
      });
    } else if (url.trim() && !existing.url) {
      updateBrand({
        customFonts: brand.customFonts.map((font) =>
          font.stack === stack ? { ...font, url: url.trim() } : font,
        ),
      });
    }

    onChange(stack);
    setCustom(false);
    setFamily('');
    setUrl('');
  };

  return (
    <div className="space-y-2">
      <select
        value={custom ? '__custom' : known ? value : value ? '__unknown' : ''}
        onChange={(event) => {
          const next = event.target.value;
          if (next === '__custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          if (next !== '__unknown') onChange(next);
        }}
        className={`${CONTROL} cursor-pointer`}
      >
        {allowInherit ? <option value="">{inheritLabel}</option> : null}
        {!known && value ? (
          <option value="__unknown">{value.split(',')[0]?.replace(/'/g, '')}</option>
        ) : null}
        {groups.map((group) => {
          const items = fonts.filter((font) => font.group === group);
          if (!items.length) return null;
          return (
            <optgroup key={group} label={group}>
              {items.map((font) => (
                <option key={font.stack} value={font.stack} style={{ fontFamily: font.stack }}>
                  {font.label}
                </option>
              ))}
            </optgroup>
          );
        })}
        <option value="__custom">Custom font&hellip;</option>
      </select>

      {custom ? (
        <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3">
          <TextInput
            value={family}
            placeholder="Font family, e.g. Cormorant Garamond"
            onChange={setFamily}
          />
          <TextInput value={url} placeholder="Stylesheet URL (optional)" onChange={setUrl} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={addCustom} className={BTN_PRIMARY}>
              Use font
            </button>
            <button
              type="button"
              onClick={() => setUrl(googleUrlFor(family))}
              className={BTN_GHOST}
            >
              Fill Google Fonts URL
            </button>
          </div>
          <p className={HINT}>
            The font is saved to the Brand Kit and reusable everywhere. Without a stylesheet URL it
            only renders where the family is already installed, falling back to Helvetica elsewhere.
          </p>
        </div>
      ) : (
        <p className="truncate text-xs text-slate-500" style={{ fontFamily: value || undefined }}>
          The quick brown fox jumps over the lazy dog
        </p>
      )}
    </div>
  );
}
