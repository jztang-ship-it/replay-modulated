// shared/lib/sentry.ts
// Single Sentry init point. No-op when VITE_SENTRY_DSN is unset, so the
// integration ships dark and lights up when the env var is set on Vercel.

import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry(sport: string): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // no DSN → Sentry is disabled

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // 'development' | 'production'
    initialScope: { tags: { sport } },
    // No performance / replay in v1 — error-only
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
  initialized = true;
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
