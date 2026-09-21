'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useId, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Glyph, type GlyphName } from '@/components/icons';
import type { CampaignStatus, RecipientStatus, TemplateStatus } from '@/lib/types';

/**
 * The design system.
 *
 * Every screen is built from these primitives, so spacing, colour and the
 * active/inactive vocabulary stay consistent. Two rules hold throughout:
 *
 *  - Colour never carries meaning alone. Status uses a dot plus a label, and
 *    disabled controls dim *and* lose their pointer.
 *  - Sizing is responsive by default: controls are comfortable on touch and
 *    compact from `sm:` upwards, rather than each page inventing its own.
 */

// --- Layout primitives ------------------------------------------------------

export function Card({
  children,
  className,
  title,
  hint,
  description,
  actions,
  padded = true,
  tone = 'plain',
  step,
  fill = false,
  collapsible = false,
  defaultOpen = true,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  /**
   * A `Tooltip` beside the title.
   *
   * Its own slot rather than part of `title` because the title truncates, and
   * an overflow-hidden box would clip the bubble. When the card is collapsible
   * it moves outside the collapse button instead -- a tooltip is a button, and
   * buttons do not nest.
   */
  hint?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Set false when the child manages its own padding. */
  padded?: boolean;
  /** `brand` tints the header, for the one card that leads a page. */
  tone?: 'plain' | 'brand';
  /**
   * Renders a numbered badge before the title and tints the header.
   *
   * For a card that is one stage of an ordered flow. The number lives here
   * rather than inside the title string so it can be styled as a badge and
   * read as "step 3" by a screen reader instead of "3. Campaign details".
   */
  step?: number;
  /**
   * Let the body stretch to the card's full height.
   *
   * Grid rows already stretch the card itself; this passes that height down to
   * the content, so a chart beside a taller neighbour fills the gap instead of
   * leaving it blank.
   */
  fill?: boolean;
  /**
   * Let the header fold the card away.
   *
   * The title becomes the control rather than gaining a separate chevron
   * button, so the whole header row is the hit target -- the behaviour anyone
   * who has used an accordion already expects. `aria-expanded` on that button
   * plus `aria-controls` on the body is the whole accessibility contract.
   */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const collapsed = collapsible && !open;

  const heading = (
    <div className="flex min-w-0 items-center gap-3">
      {step !== undefined && (
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand-600 text-2xs font-bold tabular-nums text-white">
          <span className="sr-only">Step </span>
          {step}
        </span>
      )}
      {collapsible && (
        <Glyph
          name="chevron"
          className={clsx(
            'shrink-0 text-slate-400 transition-transform',
            collapsed && '-rotate-90',
          )}
        />
      )}
      <div className="min-w-0 text-left">
        {title && (
          <div className="flex min-w-0 items-center gap-2">
            <h2
              className={clsx(
                'truncate text-base font-bold',
                step !== undefined || tone === 'brand' ? 'text-brand-900' : 'text-slate-900',
              )}
            >
              {title}
            </h2>
            {!collapsible && hint}
          </div>
        )}
        {description && <p className="mt-[3px] text-xs text-slate-500">{description}</p>}
      </div>
    </div>
  );

  return (
    <section
      className={clsx(
        'rounded-xl border border-slate-200 bg-white shadow-card',
        fill && !collapsed && 'flex flex-col',
        className,
      )}
    >
      {(title ?? actions) && (
        <header
          className={clsx(
            'flex flex-col gap-3 px-[18px] pb-3.5 pt-[18px] sm:flex-row sm:items-center sm:justify-between sm:px-5',
            // A folded card has nothing under the rule, so the rule goes too.
            collapsed ? 'rounded-b-xl' : 'border-b',
            step !== undefined || tone === 'brand'
              ? 'rounded-t-xl border-slate-200 bg-[#F4F8FC] py-[13px] sm:px-[18px]'
              : 'border-[#EEF1F5]',
          )}
        >
          {collapsible ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
                aria-controls={bodyId}
                className="-m-1 flex min-w-0 flex-1 items-center rounded-lg p-1 text-left transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                {heading}
              </button>
              {hint}
            </div>
          ) : (
            heading
          )}
          {actions && (
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
              {actions}
            </div>
          )}
        </header>
      )}
      <div
        id={bodyId}
        hidden={collapsed}
        className={clsx(padded && 'p-4 sm:p-5', fill && 'min-h-0 flex-1')}
      >
        {children}
      </div>
    </section>
  );
}

export function PageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description?: ReactNode;
  /** Optional status chips or counts, shown on the title's own line. */
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-[22px] sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className="min-w-0 truncate text-xl font-bold tracking-[-0.02em] text-slate-900 sm:text-2xl">
            {title}
          </h1>
          {meta}
        </div>
        {/* 62ch is the reference's measure: long enough for a full sentence,
            short enough that the line never runs the width of a 2K monitor. */}
        {description && (
          <p className="mt-[5px] max-w-[62ch] text-sm text-slate-500">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>
      )}
    </div>
  );
}

/** A filter/search strip. Stacks on mobile, spreads on desktop. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center', className)}>
      {children}
    </div>
  );
}

// --- Buttons ----------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'subtle';
type ButtonSize = 'xs' | 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-primary hover:bg-brand-700 active:bg-brand-800 ' +
    'focus-visible:outline-brand-600 disabled:bg-brand-300 disabled:shadow-none',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:border-[#B9C6D2] hover:bg-[#F5F7FA] ' +
    'active:bg-slate-100 focus-visible:outline-brand-600 disabled:border-slate-200',
  success:
    'bg-accent-500 text-white shadow-sm hover:bg-accent-600 active:bg-accent-700 ' +
    'focus-visible:outline-accent-500 disabled:bg-accent-300 disabled:shadow-none',
  danger:
    'border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50 ' +
    'active:bg-red-100 focus-visible:outline-red-500',
  ghost:
    'text-slate-500 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 ' +
    'focus-visible:outline-brand-600',
  subtle:
    'bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200 focus-visible:outline-brand-600',
};

/**
 * Three sizes, matching the reference's three button roles: the page's primary
 * action (10/18 at 13.5px), the secondary action beside a card title (7/14 at
 * 12.5px), and the one that sits inside a table row.
 */
const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: 'gap-1.5 rounded-md px-2.5 py-1 text-xs',
  sm: 'gap-1.5 rounded-lg px-3.5 py-[7px] text-xs',
  md: 'gap-2 rounded-[8px] px-[18px] py-2.5 text-sm',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center whitespace-nowrap font-semibold tracking-[-0.005em] transition ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Full width; useful inside forms and on mobile. */
  block?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={clsx(
        BUTTON_BASE,
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        block && 'w-full',
        className,
      )}
    >
      {loading && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = 'secondary',
  size = 'md',
  block = false,
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        BUTTON_BASE,
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        block && 'w-full',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Square button for a single glyph.
 *
 * A row action is an icon rather than a word because a table of ten rows should
 * not carry twenty words of chrome. The label is still mandatory -- it becomes
 * both the accessible name and the tooltip, so the icon is never the only way
 * to know what the button does.
 */
export function IconButton({
  label,
  children,
  variant = 'ghost',
  tone = 'default',
  className,
  href,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: ButtonVariant;
  /** `danger` tints the glyph red on hover, for destructive row actions. */
  tone?: 'default' | 'danger';
  /**
   * Renders the action as a link rather than a button.
   *
   * A row action that navigates should be a real anchor: middle-click and
   * "open in new tab" then work, and the destination shows in the status bar
   * on hover. An anchor cannot carry `disabled`, so a disabled link is greyed,
   * made unclickable and taken out of the tab order instead.
   */
  href?: string;
}) {
  const classes = clsx(
    BUTTON_BASE,
    'h-8 w-8 rounded-lg p-0',
    BUTTON_VARIANTS[variant],
    tone === 'danger' && 'hover:bg-red-50 hover:text-red-600 focus-visible:outline-red-500',
    className,
  );

  if (href !== undefined) {
    return (
      <Link
        href={href}
        title={label}
        aria-label={label}
        aria-disabled={props.disabled || undefined}
        tabIndex={props.disabled ? -1 : undefined}
        className={clsx(classes, props.disabled && 'pointer-events-none opacity-60')}
      >
        {children}
      </Link>
    );
  }

  return (
    <button {...props} title={label} aria-label={label} className={classes}>
      {children}
    </button>
  );
}

/**
 * Segmented filter control.
 *
 * The selected option is filled and marked `aria-pressed`, so the active state
 * is announced as well as seen -- the pattern used for every status filter.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx(
        'inline-flex max-w-full flex-wrap gap-0.5 rounded-[8px] bg-slate-100 p-[3px]',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              'rounded-md px-3 py-1.5 text-xs font-semibold transition',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
              active
                ? 'bg-white text-slate-900 shadow-segment'
                : 'text-slate-500 hover:bg-white/70 hover:text-slate-900',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={clsx('ml-1.5 tabular-nums', active ? 'text-brand-600' : 'text-slate-400')}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- Form controls ----------------------------------------------------------

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-slate-700">
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// Focus is a 1px brand border plus a 3px translucent halo, which reads as a
// glow rather than a second border and does not shift the control's metrics.
// 9/11 padding at 13px on a 7px radius. Focus is a brand border plus a 3px
// translucent halo -- a glow rather than a second border, and it does not shift
// the control's metrics the way a width change would.
const CONTROL_BASE =
  'block w-full rounded-lg border border-slate-300 bg-white px-[11px] py-[9px] ' +
  'text-[calc(13px*var(--type-scale))] text-slate-900 transition placeholder:text-slate-400 ' +
  'hover:border-[#B9C6D2] focus:border-brand-600 focus:shadow-focus focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 disabled:border-slate-200';

const CONTROL_INVALID =
  'border-red-300 hover:border-red-400 focus:border-red-500 ' +
  'focus:shadow-[0_0_0_3px_rgba(200,50,43,0.12)] text-red-900 placeholder:text-red-300';

const CONTROL_SIZES = { sm: 'px-[11px] py-2 text-xs', md: '' } as const;

type ControlExtras = { invalid?: boolean; sizing?: keyof typeof CONTROL_SIZES };

export function Input({
  className,
  invalid,
  sizing = 'md',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & ControlExtras) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={clsx(CONTROL_BASE, CONTROL_SIZES[sizing], invalid && CONTROL_INVALID, className)}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      className={clsx(CONTROL_BASE, 'font-mono', invalid && CONTROL_INVALID, className)}
    />
  );
}

export function Select({
  className,
  children,
  invalid,
  sizing = 'md',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & ControlExtras) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={clsx(
        CONTROL_BASE,
        'cursor-pointer pr-8',
        CONTROL_SIZES[sizing],
        invalid && CONTROL_INVALID,
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label
      className={clsx(
        'flex cursor-pointer items-start gap-2.5 text-sm text-slate-700',
        props.disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-brand-600 transition focus:ring-brand-600 disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * On/off switch.
 *
 * `role="switch"` rather than a styled checkbox, so a screen reader announces
 * "on"/"off" instead of "checked". The label is required and read out with it;
 * `labelPosition="hidden"` keeps it out of the visual layout without losing it.
 *
 * The track carries the state in colour AND position, so it survives being
 * viewed without colour.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  busy = false,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Announced by assistive tech; also the tooltip. */
  label: string;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        checked ? 'bg-accent-500' : 'bg-slate-300',
        (disabled || busy) && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[1.125rem]' : 'translate-x-[0.1875rem]',
        )}
      />
    </button>
  );
}

/**
 * Search box with a submit affordance and a reset, used above every long table.
 *
 * The reset is our own button rather than the browser's native `search` cancel
 * cross. That one clears the field but fires no submit, so the results stay
 * filtered by a term the box no longer shows -- the one state a search control
 * must never be left in. The native decoration is hidden in `globals.css`.
 */
export function SearchInput({
  id,
  value,
  onChange,
  onSubmit,
  onReset,
  placeholder = 'Search',
  label = 'Search',
  className,
}: {
  /**
   * Forwarded to the input itself.
   *
   * Without it a surrounding `<Field label htmlFor>` points at nothing: the
   * label stops being clickable and stops being announced with the control.
   */
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /**
   * Clear the term AND the applied filter. Without it the reset only empties
   * the box, so it is required whenever a search is actually applied.
   */
  onReset?: () => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  const reset = () => {
    if (onReset) onReset();
    else onChange('');
  };

  return (
    <form
      role="search"
      className={clsx('flex w-full gap-2 sm:w-auto', className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
        <Input
          id={id}
          type="search"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          // Escape is what people already press to abandon a search.
          onKeyDown={(event) => {
            if (event.key === 'Escape' && value.length > 0) {
              event.preventDefault();
              reset();
            }
          }}
          placeholder={placeholder}
          sizing="sm"
          className={clsx('w-full', value.length > 0 && 'pr-8')}
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={reset}
            title="Clear search"
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600"
          >
            <Glyph name="close" size={12} />
          </button>
        )}
      </div>
      <Button type="submit" size="sm" variant="secondary">
        Search
      </Button>
    </form>
  );
}

// --- Feedback ---------------------------------------------------------------

const ALERT_TONES = {
  info: 'bg-brand-50 text-brand-900 border-brand-100',
  success: 'bg-accent-50 text-accent-900 border-accent-100',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  error: 'bg-red-50 text-red-900 border-red-200',
} as const;

const ALERT_ICON_TONES = {
  info: 'bg-brand-600',
  success: 'bg-accent-500',
  warning: 'bg-amber-400',
  error: 'bg-red-500',
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  onDismiss,
}: {
  tone?: keyof typeof ALERT_TONES;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx(
        'flex animate-fade-in items-start gap-[9px] rounded-[8px] border px-3.5 py-3 text-xs',
        ALERT_TONES[tone],
      )}
    >
      <span
        aria-hidden
        className={clsx('mt-1.5 h-[6px] w-[6px] shrink-0 rounded-full', ALERT_ICON_TONES[tone])}
      />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={clsx(title && 'mt-1')}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 rounded px-1.5 text-lg leading-none opacity-60 transition hover:opacity-100"
        >
          &times;
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center sm:py-[38px]">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-slate-500">
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600"
      />
      {label}
    </div>
  );
}

// --- Status -----------------------------------------------------------------

type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'muted'
  | 'purple';

const BADGE_TONES: Record<BadgeTone, { chip: string; dot: string }> = {
  neutral: { chip: 'bg-slate-100 text-slate-500', dot: 'bg-[#C9D2DB]' },
  brand: { chip: 'bg-brand-50 text-brand-900', dot: 'bg-brand-600' },
  success: { chip: 'bg-accent-50 text-accent-700', dot: 'bg-accent-500' },
  warning: { chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
  danger: { chip: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  info: { chip: 'bg-teal-50 text-teal-800', dot: 'bg-teal-500' },
  muted: { chip: 'bg-slate-50 text-slate-500', dot: 'bg-slate-300' },
  purple: { chip: 'bg-purple-50 text-purple-700', dot: 'bg-purple-400' },
};

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
  pulse = false,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  const style = BADGE_TONES[tone];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-semibold',
        style.chip,
        className,
      )}
    >
      {dot && (
        <span aria-hidden className="relative flex h-[5px] w-[5px]">
          {pulse && (
            <span
              className={clsx(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                style.dot,
              )}
            />
          )}
          <span className={clsx('relative inline-flex h-[5px] w-[5px] rounded-full', style.dot)} />
        </span>
      )}
      {children}
    </span>
  );
}

/**
 * Status vocabulary, in one place.
 *
 * `live` statuses pulse so an in-flight campaign reads as moving, and the
 * active/inactive pair is green/amber rather than green/grey -- an inactive
 * template is a choice someone made, not missing data.
 */
const STATUS_TONES: Record<string, { tone: BadgeTone; live?: boolean }> = {
  // Campaigns
  DRAFT: { tone: 'neutral' },
  QUEUED: { tone: 'info', live: true },
  SENDING: { tone: 'brand', live: true },
  PAUSED: { tone: 'warning' },
  COMPLETED: { tone: 'success' },
  CANCELLED: { tone: 'muted' },
  FAILED: { tone: 'danger' },
  // Recipients
  PENDING: { tone: 'neutral' },
  SENT: { tone: 'success' },
  BOUNCED: { tone: 'warning' },
  COMPLAINT: { tone: 'danger' },
  UNSUBSCRIBED: { tone: 'purple' },
  SKIPPED: { tone: 'muted' },
  // Templates and lists
  ACTIVE: { tone: 'success' },
  INACTIVE: { tone: 'warning' },
  READY: { tone: 'success' },
  PROCESSING: { tone: 'info', live: true },
};

export function StatusBadge({
  status,
  className,
}: {
  status: CampaignStatus | RecipientStatus | TemplateStatus | string;
  className?: string;
}) {
  const config = STATUS_TONES[status] ?? { tone: 'neutral' as BadgeTone };
  return (
    <Badge tone={config.tone} dot pulse={config.live} className={clsx('capitalize', className)}>
      {status.toLowerCase()}
    </Badge>
  );
}

export function ProgressBar({
  value,
  tone = 'brand',
  label,
  size = 'md',
}: {
  value: number;
  tone?: 'brand' | 'accent' | 'gradient' | 'danger';
  label?: string;
  size?: 'sm' | 'md';
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fill =
    tone === 'gradient'
      ? 'bg-brand-wave'
      : tone === 'accent'
        ? 'bg-accent-500'
        : tone === 'danger'
          ? 'bg-red-500'
          : 'bg-brand-600';

  return (
    <div>
      {label && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate text-slate-500">{label}</span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-700">{clamped}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
        className={clsx(
          'w-full overflow-hidden rounded-full bg-[#EEF1F5]',
          size === 'sm' ? 'h-1' : 'h-1.5',
        )}
      >
        <div
          className={clsx('h-full rounded-full transition-all duration-500', fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/** Headline number. `tone` tints the value when it needs attention. */
export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint?: string;
  /** A glyph name, drawn in a tinted tile beside the figure. */
  icon?: GlyphName;
  tone?: 'default' | 'brand' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    default: 'text-slate-900',
    brand: 'text-brand-700',
    success: 'text-accent-700',
    warning: 'text-amber-700',
    danger: 'text-red-700',
  } as const;

  // The tile is a flat tint rather than a saturated fill: it labels the figure
  // without competing with it for attention.
  const tiles = {
    default: 'bg-slate-100 text-slate-500',
    brand: 'bg-brand-50 text-brand-600',
    success: 'bg-accent-50 text-accent-600',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-600',
  } as const;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-[18px] shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-2xs font-semibold uppercase tracking-[0.09em] text-slate-500">
            {label}
          </p>
          <p
            className={clsx(
              'mt-1.5 text-2xl font-bold tabular-nums tracking-[-0.02em]',
              tones[tone],
            )}
          >
            {typeof value === 'number' ? formatNumber(value) : value}
          </p>
        </div>
        {icon && (
          <span
            aria-hidden
            className={clsx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]',
              tiles[tone],
            )}
          >
            <Glyph name={icon} size={17} />
          </span>
        )}
      </div>
      {hint && <p className="mt-3 truncate text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** Label/value pairs. Stacks the value under the label on narrow screens. */
export function DescriptionList({ children }: { children: ReactNode }) {
  return <dl className="space-y-2.5 text-sm">{children}</dl>;
}

export function DescriptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate font-semibold text-slate-900 sm:text-right">{children}</dd>
    </div>
  );
}

/**
 * A small `i` that reveals a sentence of detail on hover or focus.
 *
 * For the explanation a label cannot carry without becoming a paragraph: what
 * a counter actually counts, what a field feeds, what a button will do. The
 * label stays short and the detail is one pointer-move away.
 *
 * Three things make this usable rather than decorative:
 *
 *  - **It is a real `button`.** `title` attributes and hover-only CSS never
 *    open on a touch screen and are skipped by most screen readers; a focusable
 *    button opens on tap and on Tab, and `aria-describedby` ties the bubble to
 *    it so the detail is announced rather than lost.
 *  - **The bubble is the description, not a second copy of it.** `role`
 *    `tooltip` plus the id reference is the pattern assistive tech expects, so
 *    the sentence is announced with the trigger rather than stranded as loose
 *    text after it. Only the arrow is `aria-hidden`: it is decoration.
 *  - **`side`/`align` exist because a fixed 250px bubble clips.** Near the top
 *    of a card it needs to open downward; near a left edge it needs to hang
 *    right of the trigger rather than straddle it.
 */
export function Tooltip({
  label,
  children,
  side = 'top',
  align = 'center',
}: {
  /**
   * What this explains, e.g. `"bounced"`. Becomes the button's accessible
   * name ("About bounced") -- the icon alone would announce as just "i".
   */
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  /** Which edge the bubble hangs from, when centring it would run off-screen. */
  align?: 'center' | 'start' | 'end';
}) {
  // useId keeps the description link unique when the same label appears twice
  // on a page (a "Status" tooltip in a card header and in a table header).
  const id = useId();

  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={id}
        className="inline-flex h-[17px] w-[17px] flex-none cursor-help items-center justify-center rounded-full border-[1.5px] border-[#B9C6D2] bg-white text-[calc(11.5px*var(--type-scale))] font-bold not-italic leading-none text-slate-500 transition group-hover:border-brand-600 group-hover:text-brand-600 group-focus-within:border-brand-600 group-focus-within:text-brand-600"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={clsx(
          'absolute z-20 w-[250px] max-w-[calc(100vw-32px)] rounded-[9px] bg-slate-950 px-3 py-2.5 text-left text-xs font-normal normal-case leading-[1.5] tracking-normal text-[#E7EEF4] shadow-[0_8px_22px_rgba(11,36,54,0.28)]',
          'invisible translate-y-[3px] opacity-0 transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100',
          side === 'top' ? 'bottom-full mb-[9px]' : 'top-full mt-[9px]',
          align === 'center' && 'left-1/2 -translate-x-1/2',
          align === 'start' && 'left-0',
          align === 'end' && 'right-0',
        )}
      >
        {children}
        <span
          aria-hidden="true"
          className={clsx(
            'absolute block h-0 w-0 border-[6px] border-transparent',
            side === 'top' ? 'top-full border-t-slate-950' : 'bottom-full border-b-slate-950',
            align === 'center' && 'left-1/2 -ml-[6px]',
            align === 'start' && 'left-[14px]',
            align === 'end' && 'right-[14px]',
          )}
        />
      </span>
    </span>
  );
}

/** A `{{variable}}` chip. One component so variables look identical everywhere. */
export function VariableChip({ name, braces = false }: { name: string; braces?: boolean }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-2xs text-slate-700">
      {braces ? `{{${name}}}` : name}
    </code>
  );
}

// --- Table ------------------------------------------------------------------

/**
 * Tables scroll horizontally rather than reflowing, which keeps a row readable
 * as a row. Low-priority columns are hidden below `lg` by the calling page
 * (`hidden lg:table-cell`), so the scroll is a fallback, not the main plan.
 */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="scroll-shadow -mx-4 overflow-x-auto sm:-mx-5">
      <table className={clsx('min-w-full border-collapse text-sm', className)}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={clsx(
        'whitespace-nowrap border-b border-[#EEF1F5] bg-slate-50 px-3 py-[11px] text-left text-2xs font-bold uppercase tracking-[0.09em] text-slate-500 first:pl-5 last:pr-5',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  title,
}: {
  children?: ReactNode;
  className?: string;
  /** Full value for a cell that truncates, surfaced as a native tooltip. */
  title?: string;
}) {
  return (
    <td
      title={title}
      className={clsx(
        'px-3 py-3.5 align-middle text-sm text-slate-700 first:pl-5 last:pr-5',
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Table body row with the standard hover tint. */
export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={clsx('border-t border-[#F2F4F7] transition-colors hover:bg-slate-50', className)}>
      {children}
    </tr>
  );
}

/** Right-aligned action cluster for the last cell of a row. */
export function RowActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-1.5">{children}</div>;
}

// --- Responsive data table --------------------------------------------------

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (item: T) => ReactNode;
  /** The column that titles the card on mobile. Exactly one should set this. */
  primary?: boolean;
  align?: 'left' | 'right';
  /** Drop the column from the table below this width; it stays on the card. */
  hide?: 'sm' | 'md' | 'lg' | 'xl';
  /** Leave this column off the mobile card, e.g. when the title already says it. */
  hideOnCard?: boolean;
  className?: string;
}

const HIDE_CLASS = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const;

/**
 * One dataset, two presentations.
 *
 * A table below about 640px either scrolls sideways or gets clipped, and both
 * read as broken — the first column of every row disappears the moment you
 * scroll to see the last. So on phones each row becomes a card: the primary
 * column titles it and the rest are label/value pairs, which is the shape the
 * data actually has. From `sm` upwards it is a real table, because comparing
 * rows down a column is the whole point of one.
 *
 * Defining columns once means the two views cannot drift apart.
 */
export function DataTable<T>({
  items,
  getKey,
  columns,
  actions,
}: {
  items: T[];
  getKey: (item: T) => string;
  columns: Array<Column<T>>;
  actions?: (item: T) => ReactNode;
}) {
  const primary = columns.find((column) => column.primary) ?? columns[0];

  return (
    <>
      {/* Phones: a card per row. */}
      <ul className="space-y-2.5 sm:hidden">
        {items.map((item) => (
          <li
            key={getKey(item)}
            className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="text-sm font-medium text-slate-900">{primary?.cell(item)}</div>

            <dl className="mt-2 space-y-1.5">
              {columns
                .filter((column) => column !== primary && !column.hideOnCard)
                .map((column) => (
                  <div key={column.key} className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-xs text-slate-500">{column.header}</dt>
                    {/* `flex-1` matters: a block child such as a progress bar is
                        `w-full` of this cell, which would otherwise shrink to
                        its own content and collapse the bar to nothing.
                        Cells opt into `whitespace-nowrap` for the table, where a
                        wrapped date looks ragged; in a narrow card that same
                        rule pushes the row past the screen, so it is reset. */}
                    <dd className="min-w-0 flex-1 break-words text-right text-xs text-slate-800 [&_*]:whitespace-normal">
                      {column.cell(item)}
                    </dd>
                  </div>
                ))}
            </dl>

            {actions && (
              <div className="mt-3 border-t border-slate-100 pt-2.5">{actions(item)}</div>
            )}
          </li>
        ))}
      </ul>

      {/* Tablet and up: the real thing. */}
      <div className="hidden sm:block">
        <Table>
          <thead>
            <tr>
              {columns.map((column) => (
                <Th
                  key={column.key}
                  className={clsx(
                    column.align === 'right' && 'text-right',
                    column.hide && HIDE_CLASS[column.hide],
                  )}
                >
                  {column.header}
                </Th>
              ))}
              {actions && <Th className="text-right">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Tr key={getKey(item)}>
                {columns.map((column) => (
                  <Td
                    key={column.key}
                    className={clsx(
                      column.align === 'right' && 'text-right',
                      column.hide && HIDE_CLASS[column.hide],
                      column.className,
                    )}
                  >
                    {column.cell(item)}
                  </Td>
                ))}
                {actions && (
                  <Td>
                    <RowActions>{actions(item)}</RowActions>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return <p className="pt-3 text-xs text-slate-500">{total.toLocaleString()} total</p>;
  }

  return (
    <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">
        Page <span className="font-medium text-slate-700">{page}</span> of {totalPages} &middot;{' '}
        {total.toLocaleString()} total
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// --- Formatting -------------------------------------------------------------

export function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * How long something took, in the coarsest unit that still reads honestly.
 *
 * Returns null unless both ends are known, so an in-flight or never-started
 * run omits the duration rather than showing one that is still growing.
 */
export function formatDuration(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): string | null {
  if (!fromIso || !toIso) return null;

  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return plural(seconds, 'second');

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return plural(minutes, 'minute');

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) {
    return restMinutes === 0 ? plural(hours, 'hour') : `${hours}h ${restMinutes}m`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? plural(days, 'day') : `${days}d ${restHours}h`;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
