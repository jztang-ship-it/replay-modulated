import React from 'react';
import type { PlayerCard, GamePhase } from '../types/index';
import type { TierThreshold } from './TierGauge';

const idOf = (c: PlayerCard) => String((c as any).cardId ?? (c as any).basePlayerId ?? c.id);
const label = (tier: string) => tier.replace(/_/g, '-');
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
export function fandomSummary(cards: PlayerCard[], completed: Set<string>, thresholds: TierThreshold[], finished: boolean) {
  const visible = finished ? cards : cards.filter(c => completed.has(idOf(c)));
  const score = Math.round(visible.reduce((sum, c) => sum + Number(c.actualFp || 0), 0) * 10) / 10;
  const tiers = thresholds.filter(t => !['NONE', 'BUST'].includes(t.tier)).slice().sort((a, b) => a.minFP - b.minFP);
  const next = tiers.find(t => t.minFP > score);
  const achieved = [...tiers].reverse().find(t => t.minFP <= score);
  return { score, next, achieved, tiers, remaining: Math.max(0, cards.length - visible.length) };
}
export function historyLine(card?: PlayerCard) {
  if (!card) return '';
  const game = card.gameInfo;
  const s = card.statLine ?? {};
  const stats = [['PTS', s.pts ?? s.points], ['REB', s.reb ?? s.rebounds], ['AST', s.ast ?? s.assists]]
    .filter(([, value]) => value != null && Number.isFinite(Number(value)))
    .map(([key, value]) => `${value} ${key}`).join(' · ');
  return [game?.date?.slice(0, 10), game?.opponent ? `${game.homeAway === 'A' ? '@' : 'vs'} ${game.opponent}` : '', stats].filter(Boolean).join(' · ');
}
type Props = { cards: PlayerCard[]; state: GamePhase; heldIds: Set<string>; completedIds: Set<string>;
  lastCardId?: string | null; thresholds: TierThreshold[]; roundsUsed: number; maxRounds: number };
export function FandomPanel({ cards, state, heldIds, completedIds, lastCardId, thresholds, roundsUsed, maxRounds }: Props) {
  const finished = state === 'RESULTS' || state === 'WIN_CELEBRATION';
  const revealing = state === 'REVEALING';
  const backing = cards.filter(c => heldIds.has(idOf(c)) || c.wasHeld);
  const summary = fandomSummary(cards, completedIds, thresholds, finished);
  const leader = finished ? [...cards].sort((a, b) => b.actualFp - a.actualFp)[0] : undefined;
  // Never surface a hidden player's performance, even if the server already knows it.
  const last = cards.find(c => idOf(c) === lastCardId && completedIds.has(idOf(c)));
  const featured = leader ?? last;
  const attribution = featured && (featured.wasHeld || heldIds.has(idOf(featured))) ? 'Backed' : 'Drawn';
  const finalDraw = roundsUsed >= maxRounds - 1;
  const names = backing.map(c => c.name.split(' ').slice(-1)[0]).join(', ');
  let headline = 'Back who you trust. Draw the rest.';
  let detail = 'Five players. Real historical nights.';
  let context = 'The ladder shows how your hand scores.';
  if (state === 'HOLD' || state === 'DRAWING') {
    headline = backing.length ? `Backing ${names}` : 'Who are you backing?';
    detail = backing.length === cards.length ? 'All five backed · Reveal their nights' : `${cards.length - backing.length} spots ${finalDraw ? 'ride the final draw' : 'to draw'}${finalDraw ? ' · No more picks after this' : ''}`;
    context = 'Tap a player to back them · Backed players stay';
  } else if (revealing || finished) {
    headline = summary.next
      ? `${one(summary.next.minFP - summary.score)} ${finished ? 'short of' : 'to'} ${label(summary.next.tier)}${finished ? '' : ` · ${summary.remaining} left`}`
      : `${label(summary.achieved?.tier ?? 'ROOKIE')} reached${finished ? '' : ` · ${summary.remaining} left`}`;
    detail = featured ? `${featured.name} · ${attribution} · ${one(featured.actualFp)} FP${finished ? ' · Hand leader' : ''}` : 'Which night will your five deliver?';
    const waiting = backing.filter(c => !completedIds.has(idOf(c)));
    context = featured ? historyLine(featured) : waiting.length ? `${waiting.map(c => c.name.split(' ').slice(-1)[0]).join(', ')} still to come` : 'Reveal the real games behind your hand';
  }
  const row: React.CSSProperties = { margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', lineHeight: '18px' };
  return <section data-fandom-panel aria-label="Your hand and season tiers" style={{ width: '100%', height: 96, boxSizing: 'border-box', padding: '3px 2px', display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'center', color: '#e5e7eb' }}>
    <div data-tier-reference style={{ display: 'flex', gap: 3, width: '100%', justifyContent: 'center', marginBottom: 2 }}>
      {summary.tiers.map(t => <div key={t.tier} style={{ flex: 1, minWidth: 0, borderBottom: `2px solid ${(revealing || finished) && summary.score >= t.minFP ? '#F5C850' : '#344155'}`, paddingBottom: 2, fontSize: 9, lineHeight: '11px', color: '#cbd5e1' }}>
        <span style={{ display: 'block', fontWeight: 700 }}>{label(t.tier)}</span><span>{t.minFP}</span>
      </div>)}
    </div>
    <p title={headline} style={{ ...row, fontWeight: 800, fontSize: 13, color: '#F5C850' }}>{headline}</p>
    <p title={detail} style={{ ...row, fontSize: 12 }}>{detail}</p>
    <p title={context} style={{ ...row, fontSize: 10, color: '#b8c4d4' }}>{context}</p>
  </section>;
}
