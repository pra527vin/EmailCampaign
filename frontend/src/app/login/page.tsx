'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, errorMessage } from '@/lib/api';
import { Alert, Button, Field, Input } from '@/components/ui';
import { BrandMark } from '@/components/brand-mark';
import type { User } from '@/lib/types';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Fetch the CSRF cookie before the form can be submitted. The login POST is
  // CSRF-protected like every other mutation, and a fresh browser has no
  // token cookie yet, so without this the first login would always be a 403.
  useEffect(() => {
    api.get('/auth/csrf').catch(() => {
      setError('Could not reach the server. Check that the API is running.');
    });
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post<{ user: User }>('/auth/login', { email: email.trim(), password });
      // A full navigation, so the middleware re-evaluates with the new cookie.
      router.replace(nextPath.startsWith('/') ? nextPath : '/dashboard');
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(errorMessage(caught));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-wave-soft px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <BrandMark className="h-14 w-14" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Sign in to MailStrive</h1>
          <p className="mt-1 text-sm text-slate-500">Campaign management for permission-based email.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-card"
        >
          {error && <Alert tone="error">{error}</Alert>}

          <Field label="Email address" htmlFor="email" error={fieldErrors['email']}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Password" htmlFor="password" error={fieldErrors['password']}>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Button type="submit" loading={submitting} block>
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Use this system only for recipients who have opted in to hear from you.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
