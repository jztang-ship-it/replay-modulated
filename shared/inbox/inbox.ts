// shared/inbox/inbox.ts
// Supabase wrapper functions for the inbox + feedback flows.
// All inserts are client-side via RLS-allowed types; promo/survey are server-side only.

import { supabase } from "@shared/lib/supabase";

// ---------- Types ----------

export type MessageType = 'welcome' | 'big_win' | 'bonus_pool' | 'promo' | 'survey';

export const MESSAGE_ICONS: Record<MessageType, string> = {
  welcome: '👋',
  big_win: '🎉',
  bonus_pool: '💰',
  promo: '📢',
  survey: '📋',
};

export type CTA = { label: string; url: string };

export type SurveyPayload = {
  question: string;
  options: string[];
  type: 'single' | 'multi';
  response?: string | string[];
  answered_at?: string;
};

export type Payload = {
  body: string;
  title?: string;
  cta?: CTA;
  // big_win
  tier?: 'MVP+' | 'LEGEND';
  fp?: number;
  hand_id?: string;
  // bonus_pool
  amount_won?: number;
  // survey
  survey?: SurveyPayload;
};

export type InboxMessage = {
  id: string;
  user_id: string;
  message_type: MessageType;
  payload: Payload;
  read_at: string | null;
  created_at: string;
};

export type FeedbackAnswers = Record<string, string | string[] | number | null>;

export type FeedbackMetadata = {
  app_version?: string;
  sport?: string;
  last_hand_id?: string;
};

// ---------- Reads ----------

export async function listMessages(userId: string): Promise<InboxMessage[]> {
  const { data, error } = await supabase
    .from('inbox_messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[inbox] listMessages failed', error); return []; }
  return (data ?? []) as InboxMessage[];
}

export async function markRead(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('inbox_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('read_at', null);
  if (error) console.warn('[inbox] markRead failed', error);
}

// ---------- Cap ----------
// MVP cap: keep only the 20 newest messages per user. Older ones are deleted
// after each insert so the inbox sheet never grows unbounded.
export const INBOX_MAX_MESSAGES = 20;

async function pruneInboxToCap(userId: string): Promise<void> {
  // Fetch ids of messages older than the most-recent INBOX_MAX_MESSAGES.
  const { data, error: readErr } = await supabase
    .from('inbox_messages')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(INBOX_MAX_MESSAGES, INBOX_MAX_MESSAGES + 999);
  if (readErr) { console.warn('[inbox] pruneInboxToCap read failed', readErr); return; }
  const stale = (data ?? []) as Array<{ id: string }>;
  if (stale.length === 0) return;
  const { error: delErr } = await supabase
    .from('inbox_messages')
    .delete()
    .in('id', stale.map(r => r.id));
  if (delErr) console.warn('[inbox] pruneInboxToCap delete failed', delErr);
}

// ---------- Inserts (event-driven, RLS-allowed types only) ----------

export async function addWelcomeMessage(userId: string): Promise<void> {
  const payload: Payload = {
    title: 'Welcome to ReplayMod',
    body: "You're in. Pick a roster, watch the hand play out, see how you stacked up. We'll send notes here when something big happens.",
  };
  const { error } = await supabase
    .from('inbox_messages')
    .insert({ user_id: userId, message_type: 'welcome', payload });
  if (error) { console.warn('[inbox] addWelcomeMessage failed', error); return; }
  await pruneInboxToCap(userId);
}

export async function addBigWinMessage(
  userId: string,
  args: { tier: 'MVP+' | 'LEGEND'; fp: number; hand_id: string }
): Promise<void> {
  const payload: Payload = {
    title: `${args.tier} hand`,
    body: `${args.fp.toFixed(1)} fp — ${args.tier === 'LEGEND' ? 'legendary hand' : 'strong performance'}. The bench paid off.`,
    tier: args.tier,
    fp: args.fp,
    hand_id: args.hand_id,
  };
  const { error } = await supabase
    .from('inbox_messages')
    .insert({ user_id: userId, message_type: 'big_win', payload });
  if (error) { console.warn('[inbox] addBigWinMessage failed', error); return; }
  await pruneInboxToCap(userId);
}

export async function addBonusPoolMessage(
  userId: string,
  args: { amount_won: number },
  // ECONOMY-GATED — this writes a bonus-pool/coins message. The bonus pool is
  // paused while the economy is gated (F2P layer; see docs/economy-retrieval-map.md).
  // This util has no adapter/economyEnabled context, so the gate is an EXPLICIT,
  // required param: a future caller (bonus-pool distribution is post-beta — still
  // no call site) MUST pass the sport's economyEnabled, and the function no-ops when
  // false. Re-wiring is therefore a deliberate decision, not a silent default.
  // DO NOT WIRE WHILE ECONOMY GATED. Hide-don't-delete: the function stays intact.
  economyEnabled: boolean,
): Promise<void> {
  if (!economyEnabled) return;
  const payload: Payload = {
    title: 'You got a piece of the pool',
    body: `+${args.amount_won.toLocaleString()} coins from the bonus pool. Nice run.`,
    amount_won: args.amount_won,
  };
  const { error } = await supabase
    .from('inbox_messages')
    .insert({ user_id: userId, message_type: 'bonus_pool', payload });
  if (error) { console.warn('[inbox] addBonusPoolMessage failed', error); return; }
  await pruneInboxToCap(userId);
}

// ---------- Survey response ----------

export async function submitSurveyResponse(
  messageId: string,
  response: string | string[]
): Promise<void> {
  // Read-modify-write the message's payload to set survey.response and survey.answered_at.
  const { data, error: readErr } = await supabase
    .from('inbox_messages')
    .select('payload')
    .eq('id', messageId)
    .single();
  if (readErr || !data) { console.warn('[inbox] submitSurveyResponse read failed', readErr); return; }
  const payload = data.payload as Payload;
  const survey = payload.survey;
  if (!survey) { console.warn('[inbox] submitSurveyResponse: message has no survey field', messageId); return; }

  const updatedPayload: Payload = {
    ...payload,
    survey: { ...survey, response, answered_at: new Date().toISOString() },
  };
  const { error: writeErr } = await supabase
    .from('inbox_messages')
    .update({ payload: updatedPayload })
    .eq('id', messageId);
  if (writeErr) console.warn('[inbox] submitSurveyResponse write failed', writeErr);
}

// ---------- Feedback flow ----------

export async function getSubmissionNumber(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('feedback_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) { console.warn('[inbox] getSubmissionNumber failed', error); return 1; }
  return (count ?? 0) + 1;
}

export async function getSurveySubmissionNumber(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('feedback_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .filter('answers->>kind', 'eq', 'survey');
  if (error) { console.warn('[inbox] getSurveySubmissionNumber failed', error); return 1; }
  return (count ?? 0) + 1;
}

export async function getMessageSubmissionNumber(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('feedback_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .filter('answers->>kind', 'eq', 'message');
  if (error) { console.warn('[inbox] getMessageSubmissionNumber failed', error); return 1; }
  return (count ?? 0) + 1;
}

export async function submitFeedback(
  userId: string,
  answers: FeedbackAnswers,
  submissionNumber: number,
  metadata: FeedbackMetadata = {}
): Promise<boolean> {
  const { error } = await supabase
    .from('feedback_submissions')
    .insert({
      user_id: userId,
      answers,
      submission_number: submissionNumber,
      metadata,
    });
  if (error) { console.warn('[inbox] submitFeedback failed', error); return false; }
  return true;
}

export async function grantFeedbackCoins(amount: number): Promise<void> {
  const { error } = await supabase.rpc('grant_coins', { p_amount: amount, p_reason: 'feedback_v1' });
  if (error) console.warn('[inbox] grantFeedbackCoins failed', error);
}
