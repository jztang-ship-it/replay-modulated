/**
 * shared/analytics/analytics.ts
 *
 * Universal event pipeline for ReplayMod.
 * ONE function call from anywhere in any product.
 *
 * Events go to TWO destinations simultaneously:
 *   1. /api/analytics  — Vercel KV (aggregated counters, your dashboard)
 *   2. PostHog         — raw event stream (funnels, retention, session replay)
 *
 * HOW TO USE:
 *   import { track } from '@shared/analytics/analytics';
 *   track('gameplay', 'hand_resolved', { score: 142, tier: 'STARTER', bust: false });
 *
 * HOW TO ENABLE POSTHOG:
 *   Add environment variables (Vercel + local .env if needed):
 *     VITE_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
 *     VITE_POSTHOG_HOST=https://us.i.posthog.com   // or https://eu.i.posthog.com
 *     VITE_ANALYTICS_DISABLED=false                // optional override
 *   Get your key from PostHog → Project Settings → Project API Key
 *   That's it. Events start flowing immediately.
 *
 * HOW TO ADD A NEW PRODUCT:
 *   1. Add to Product type below (one line)
 *   2. Call track() with your new product string
 *   Done.
 *
 * HOW TO ADD A NEW FEATURE:
 *   1. Add to Feature type below (one line)
 *   2. Call track() with your new feature string
 *   Done.
 */

export type Product =
  | 'basketball' | 'worldcup' | 'football' | 'nfl' | 'hockey'
  | 'baseball' | 'mma' | 'cricket' | 'news' | 'social' | 'pvp' | 'system'
  | string;

export type Feature =
  | 'gameplay' | 'news_feed' | 'comments' | 'challenges' | 'profile'
  | 'onboarding' | 'leaderboard' | 'notifications' | 'settings' | 'auth' | 'system'
  | string;

export type Platform = 'web' | 'ios' | 'android';

export interface ReplayEvent {
  userId:     string;
  sessionId:  string;
  product:    Product;
  feature:    Feature;
  action:     string;
  props:      Record<string, string | number | boolean | null>;
  timestamp:  number;
  platform:   Platform;
  appVersion: string;
}

interface AnalyticsConfig {
  endpoint:   string;
  appVersion: string;
  platform:   Platform;
  debug:      boolean;
  batchSize:  number;
  batchMs:    number;
  disabled:   boolean;
}

const DEFAULT_CONFIG: AnalyticsConfig = {
  endpoint:   '/api/analytics',
  appVersion: '1.0.0',
  platform:   'web',
  debug:      import.meta.env.MODE === 'development',
  batchSize:  1,
  batchMs:    1000,
  disabled:   false,
};

// ── PostHog config ────────────────────────────────────────────────────────────
// Set VITE_POSTHOG_KEY in Vercel env vars. If not set, PostHog is silently skipped.
const POSTHOG_KEY  = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';
const ANALYTICS_DISABLED_ENV = (import.meta.env.VITE_ANALYTICS_DISABLED as string | undefined)?.toLowerCase();
const ANALYTICS_DISABLED =
  ANALYTICS_DISABLED_ENV === 'true'
    ? true
    : ANALYTICS_DISABLED_ENV === 'false'
      ? false
      : (typeof window !== 'undefined' && window.location.hostname === 'localhost');

function getOrCreateUserId(): string {
  try {
    const key = 'rm_uid';
    let uid = localStorage.getItem(key);
    if (!uid) {
      uid = 'u_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      localStorage.setItem(key, uid);
    }
    return uid;
  } catch { return 'u_anonymous'; }
}

function getOrCreateSessionId(): string {
  try {
    const key = 'rm_sid', tsKey = 'rm_sid_ts';
    const SESSION_TTL = 30 * 60 * 1000;
    const now = Date.now();
    const last = parseInt(localStorage.getItem(tsKey) ?? '0', 10);
    let sid = localStorage.getItem(key);
    if (!sid || now - last > SESSION_TTL) {
      sid = 's_' + Math.random().toString(36).slice(2, 11) + now.toString(36);
      localStorage.setItem(key, sid);
    }
    localStorage.setItem(tsKey, String(now));
    return sid;
  } catch { return 's_anonymous'; }
}

function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'web';
}

class Analytics {
  private config: AnalyticsConfig;
  private queue: ReplayEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private userId: string;
  private sessionId: string;
  private platform: Platform;
  private currentProduct: Product | null = null;
  private middleware: ((e: ReplayEvent) => ReplayEvent | null)[] = [];

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config    = { ...DEFAULT_CONFIG, disabled: ANALYTICS_DISABLED, ...config };
    this.userId    = getOrCreateUserId();
    this.sessionId = getOrCreateSessionId();
    this.platform  = getPlatform();
    this.scheduleFlush();
    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flush();
      });
      window.addEventListener('beforeunload', () => this.flush());
    }
  }

  track(feature: Feature, action: string, props: Record<string, string | number | boolean | null> = {}, product?: Product): void {
    if (this.config.disabled) return;
    let event: ReplayEvent | null = {
      userId: this.userId, sessionId: this.sessionId,
      product: product ?? this.currentProduct ?? 'system',
      feature, action, props,
      timestamp: Date.now(), platform: this.platform, appVersion: this.config.appVersion,
    };
    for (const mw of this.middleware) {
      if (!event) break;
      event = mw(event);
    }
    if (!event) return;
    if (this.config.debug) console.log('[Analytics]', event.product + '/' + event.feature + '/' + event.action, event.props);
    this.queue.push(event);
    if (this.queue.length >= this.config.batchSize) this.flush();
  }

  setProduct(product: Product): void { this.currentProduct = product; }
  configure(overrides: Partial<AnalyticsConfig>): void { this.config = { ...this.config, ...overrides }; }
  use(fn: (e: ReplayEvent) => ReplayEvent | null): void { this.middleware.push(fn); }
  newSession(): void { try { localStorage.removeItem('rm_sid'); } catch {} this.sessionId = getOrCreateSessionId(); }

  flush(): void {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0);
    this.sendToKV(batch);
    this.sendToPostHog(batch);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => { this.flush(); this.scheduleFlush(); }, this.config.batchMs);
  }

  // ── Destination 1: Vercel KV via your /api/analytics route ───────────────
  private async sendToKV(events: ReplayEvent[]): Promise<void> {
    try {
      await fetch(this.config.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }), keepalive: true,
      });
    } catch (e) {
      if (this.config.debug) console.warn('[Analytics] KV send failed:', e);
      // Re-queue on failure so we don't lose events
      if (this.queue.length < 100) this.queue.unshift(...events);
    }
  }

  // ── Destination 2: PostHog capture API (no SDK, no extra bundle) ──────────
  // Each ReplayMod event maps to a PostHog event named "{product}/{feature}/{action}"
  // so they're easy to filter and funnel in the PostHog UI.
  // e.g. "basketball/gameplay/hand_resolved", "worldcup/gameplay/hand_dealt"
  private async sendToPostHog(events: ReplayEvent[]): Promise<void> {
    if (!POSTHOG_KEY) return; // key not set → silently skip

    const batch = events.map(e => ({
      event:        `${e.product}/${e.feature}/${e.action}`,
      distinct_id:  e.userId,
      timestamp:    new Date(e.timestamp).toISOString(),
      properties: {
        // Standard PostHog props
        $session_id:  e.sessionId,
        $lib:         'replaymod-web',
        // ReplayMod structure fields — queryable as top-level props in PostHog
        product:      e.product,
        feature:      e.feature,
        action:       e.action,
        platform:     e.platform,
        app_version:  e.appVersion,
        // Spread all game-specific props (score, tier, bust, salary, etc.)
        ...e.props,
      },
    }));

    try {
      await fetch(`${POSTHOG_HOST}/batch/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: POSTHOG_KEY, batch }),
        keepalive: true,
      });
    } catch (e) {
      // PostHog is non-critical — log in debug, never re-queue, never block
      if (this.config.debug) console.warn('[Analytics] PostHog send failed:', e);
    }
  }
}

export const analytics = new Analytics();
export function track(feature: Feature, action: string, props: Record<string, string | number | boolean | null> = {}, product?: Product): void { analytics.track(feature, action, props, product); }
export function setProduct(product: Product): void { analytics.setProduct(product); }
export default analytics;