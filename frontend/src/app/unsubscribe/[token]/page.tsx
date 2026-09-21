'use client';

import { use, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';

/**
 * Public unsubscribe confirmation page.
 *
 * Deliberately outside the authenticated layout: the person clicking this link
 * is a recipient, not an operator. The signed token in the URL is the only
 * thing that identifies the address, and the page never reveals anything about
 * the campaign beyond the address itself.
 */
export default function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [email, setEmail] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'done' | 'invalid'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ email: string }>(`/unsubscribe/${token}`)
      .then((data) => {
        setEmail(data.email);
        setState('ready');
      })
      .catch((caught) => {
        setError(errorMessage(caught));
        setState('invalid');
      });
  }, [token]);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/unsubscribe/${token}/confirm`);
      setState('done');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-wave-soft px-4 py-12">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-card sm:p-7">
        {state === 'loading' && <p className="text-center text-sm text-slate-500">Checking your link…</p>}

        {state === 'invalid' && (
          <>
            <h1 className="text-lg font-semibold text-slate-900">This link is not valid</h1>
            <p className="mt-2 text-sm text-slate-600">
              {error ?? 'The unsubscribe link is malformed or has been altered.'}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              You can reply to any message you received from us and ask to be removed — we will
              action it manually.
            </p>
          </>
        )}

        {state === 'ready' && (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Unsubscribe from our emails</h1>
            <p className="mt-2 text-sm text-slate-600">
              Confirm that you no longer want to receive marketing email at:
            </p>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
              {email}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              This takes effect immediately and applies to every future campaign, not just this one.
            </p>

            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-red-600">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? 'Unsubscribing…' : 'Confirm unsubscribe'}
            </button>
          </>
        )}

        {state === 'done' && (
          <>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-accent-700">
              ✓
            </div>
            <h1 className="text-lg font-semibold text-slate-900">You have been unsubscribed</h1>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-mono">{email}</span> has been added to our suppression list and
              will not receive further marketing email from us.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              You may still receive transactional messages related to an existing account or order.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
