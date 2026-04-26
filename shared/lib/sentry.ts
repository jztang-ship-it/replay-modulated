// shared/lib/sentry.ts
// Single Sentry init point. No-op when VITE_SENTRY_DSN is unset, so the
// integration ships dark and lights up when the env var is set on Vercel.
//
// IMPORTANT: this file does NOT import @sentry/react directly — that import
// fails to resolve from shared/ in production builds (the package is in each
// sport's node_modules, not at the repo root). Each sport's main.tsx imports
// Sentry locally and passes the module reference into initSentry().

type SentryModule = {
  init(options: {
    dsn: string;
    environment?: string;
    initialScope?: { tags?: Record<string, string> };
    tracesSampleRate?: number;
    replaysSessionSampleRate?: number;
    replaysOnErrorSampleRate?: number;
  }): void;
  captureException(error: unknown, captureContext?: { extra?: Record<string, unknown> }): void;
};

let sentryRef: SentryModule | null = null;
let initialized = false;

export function initSentry(sport: string, sentryModule: SentryModule): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // no DSN → Sentry is disabled

  sentryModule.init({
    dsn,
    environment: import.meta.env.MODE,
    initialScope: { tags: { sport } },
    // No performance / replay in v1 — error-only
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
  sentryRef = sentryModule;
  initialized = true;
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!initialized || !sentryRef) return;
  sentryRef.captureException(error, context ? { extra: context } : undefined);
}
