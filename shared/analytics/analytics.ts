/**
 * shared/analytics/analytics.ts
 *
 * Universal event pipeline for ReplayMod.
 * ONE function call from anywhere in any product.
 *
 * HOW TO USE:
 *   import { track } from '@shared/analytics/analytics';
 *   track('gameplay', 'hand_resolved', { score: 142, tier: 'STARTER', bust: false });
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
    batchSize:  10,
    batchMs:    5000,
    disabled:   typeof window !== 'undefined' && window.location.hostname === 'localhost',
};

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
    this.config    = { ...DEFAULT_CONFIG, ...config };
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
    this.send(batch);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => { this.flush(); this.scheduleFlush(); }, this.config.batchMs);
  }

  private async send(events: ReplayEvent[]): Promise<void> {
    try {
      await fetch(this.config.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }), keepalive: true,
      });
    } catch (e) {
      if (this.config.debug) console.warn('[Analytics] Send failed:', e);
      if (this.queue.length < 100) this.queue.unshift(...events);
    }
  }
}

export const analytics = new Analytics();
export function track(feature: Feature, action: string, props: Record<string, string | number | boolean | null> = {}, product?: Product): void { analytics.track(feature, action, props, product); }
export function setProduct(product: Product): void { analytics.setProduct(product); }
export default analytics;