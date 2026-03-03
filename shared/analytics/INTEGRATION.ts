/**
 * shared/analytics/INTEGRATION.ts
 *
 * Copy-paste examples for wiring analytics into any product.
 * This file is documentation — do not import it.
 *
 * ─── STEP 1: App init (do once per sport, in App.tsx) ────────────────────────
 */

import { setProduct, track } from '@shared/analytics/analytics';

// Basketball App.tsx
setProduct('basketball');

// Worldcup App.tsx
setProduct('worldcup');

// ─── STEP 2: Game events (fire these in GameView.tsx) ────────────────────────

// When a hand is dealt
track('gameplay', 'hand_dealt', {
  rosterCost:  165,
  playerCount: 6,
});

// When a hand resolves
track('gameplay', 'hand_resolved', {
  score:      142.5,
  tier:       'STARTER',  // MVP | ALL_STAR | STARTER | ROOKIE | NONE
  bust:       false,
  badgeCount: 2,
  duration_ms: 45000,     // how long the reveal took
});

// When a card is held
track('gameplay', 'card_held', {
  position: 'G',
  tier:     'ORANGE',
  salary:   55,
});

// When "so close" triggers (within 5 FP of next tier)
track('gameplay', 'so_close', {
  currentFp:  149.2,
  nextTierFp: 155,
  nextTier:   'ROOKIE',
  gapFp:      5.8,
});

// When session ends (fire on page unload or after N minutes idle)
track('gameplay', 'session_end', {
  handsPlayed: 8,
  duration_ms: 720000,
  totalScore:  1103.5,
});

// ─── STEP 3: News events ─────────────────────────────────────────────────────

track('news_feed', 'article_viewed', {
  articleId:   'nba-lakers-trade-2026-03-01',
  sport:       'basketball',
  category:    'trades',
  secondsRead: 45,
});

track('news_feed', 'article_shared', {
  articleId: 'nba-lakers-trade-2026-03-01',
  sport:     'basketball',
  channel:   'twitter',  // twitter | copy_link | whatsapp | etc
});

// ─── STEP 4: Social events ───────────────────────────────────────────────────

track('comments', 'comment_posted', {
  sport:       'basketball',
  contentType: 'article',  // article | hand_result | player_card
  parentId:    '',          // empty = top-level, non-empty = reply
});

track('comments', 'comment_liked', {
  sport:     'basketball',
  commentId: 'cmt_abc123',
});

track('challenges', 'challenge_sent', {
  sport:      'basketball',
  opponentId: 'u_xyz789',
});

track('challenges', 'challenge_accepted', {
  sport:       'basketball',
  challengeId: 'ch_abc123',
});

// ─── STEP 5: System events ───────────────────────────────────────────────────

// App opened (fire in main.tsx or App.tsx useEffect)
track('system', 'app_opened', {
  platform: 'web',
  version:  '1.0.0',
});

// Error tracking (wire into your ErrorBoundary)
track('system', 'error', {
  code:    'DATA_LOAD_FAILED',
  message: 'Failed to load players.json',
  context: 'GameView.tsx:handleDeal',
});

// ─── STEP 6: Adding a brand new product ──────────────────────────────────────
//
// 1. Open shared/analytics/analytics.ts
// 2. Add your product to the Product type:
//      | 'mma'   ← add this
// 3. That's it. Start calling track() with product='mma'
//
// No other files to change. The API route, aggregation, and dashboard
// all handle new products automatically.

// ─── STEP 7: Adding a brand new feature ──────────────────────────────────────
//
// 1. Open shared/analytics/analytics.ts
// 2. Add your feature to the Feature type:
//      | 'leaderboard'   ← add this
// 3. Start calling track('leaderboard', 'viewed', { ... })
// 4. Optionally add a case to api/analytics.ts aggregateByFeature()
//    if you want pre-computed metrics for that feature.
//    (Raw events are always stored regardless.)
//
// ─── STEP 8: Middleware examples ─────────────────────────────────────────────

import analytics from '@shared/analytics/analytics';

// Add A/B test variant to every event
analytics.use(event => ({
  ...event,
  props: { ...event.props, ab_variant: 'control' }
}));

// Drop events from known bots
analytics.use(event => {
  if (navigator.userAgent.includes('bot')) return null;
  return event;
});

// Add user subscription tier to every event
analytics.use(event => ({
  ...event,
  props: { ...event.props, user_tier: 'free' } // replace with real lookup
}));