'use client';

import { AlertTriangle } from 'lucide-react';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  /** Changing this clears a caught error -- selecting another block recovers. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a failure inside one block's settings from unmounting the composer.
 *
 * Settings panels are the most varied code here -- each block contributes its
 * own -- and an editor that disappears would take an unsaved design's context
 * with it. The canvas and everything already stored stay untouched, and
 * picking another block clears the message.
 */
export class SettingsBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Worth a console entry: the panel below says what happened to the person,
    // but not where in the tree it came from.
    console.error('Compose settings panel failed', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
          <AlertTriangle size={14} /> These settings could not be shown
        </p>
        <p className="mt-1.5 text-2xs leading-relaxed text-slate-500">
          The block itself is fine and your design is saved &mdash; select another block and come
          back, or reload the page.
        </p>
        <p className="mt-2 break-words font-mono text-[10.5px] leading-snug text-slate-400">
          {error.message || String(error)}
        </p>
      </div>
    );
  }
}
