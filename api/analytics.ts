import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

const YEAR = 60 * 60 * 24 * 365
const DAY = 60 * 60 * 24

async function inc(key: string, value: number, ttl: number) {
  await kv.incrby(key, value)
  await kv.expire(key, ttl)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const events = Array.isArray(body) ? body : (body?.events ?? [body])

    if (!events.length) {
      return res.status(400).json({ error: 'Missing events' })
    }

    const d = new Date().toISOString().slice(0, 10)

    for (const evt of events) {
      if (!evt) continue
      const feature = String(evt.feature ?? '')
      const action  = String(evt.action ?? evt.event ?? '')
      const props   = evt.props ?? {}
      const sport   = String(props.sport ?? 'basketball')
      const uid     = String(props.uid ?? props.userId ?? props.distinct_id ?? '')

      // ── New / Returning user tracking ──────────────────────────────────────
      // Client sends user_status: "new" | "returning" on every event.
      // We count unique users per day via a set, then increment the counter.
      if (uid && props.user_status) {
        const dauKey = `dau:${d}`
        const added = await kv.zadd(dauKey, { score: Date.now(), member: uid })
        await kv.expire(dauKey, YEAR)

        if (added) {
          // First event from this user today — count as new or returning
          if (props.user_status === 'new') {
            await inc(`new_users:${d}`, 1, YEAR)
          } else {
            await inc(`returning_users:${d}`, 1, YEAR)
          }
        }
      }

      // ── Session tracking ───────────────────────────────────────────────────
      if (feature === 'session' && action === 'session_end') {
        await inc(`gameplay:sessions:${d}`, 1, YEAR)

        // Per-sport session counters (read by analytics-read gameplay view)
        await inc(`sessions:${sport}:${d}:count`, 1, YEAR)
        const handsPlayed = Number(props.handsPlayed ?? 0)
        const durationMs  = Number(props.duration_ms ?? 0)
        if (handsPlayed > 0) await inc(`sessions:${sport}:${d}:hands_sum`, handsPlayed, YEAR)
        if (durationMs > 0)  await inc(`sessions:${sport}:${d}:duration_sum`, Math.round(durationMs / 1000), YEAR)
      }

      // ── Global aggregations ────────────────────────────────────────────────
      if (feature === 'gameplay' && action === 'hand_dealt') {
        await inc(`gameplay:hands_dealt:${d}`, 1, YEAR)
      }
      if (action === 'hand_resolved') {
        const bust = props.bust ?? false
        if (!bust) await inc(`gameplay:wins:${d}`, 1, YEAR)
        await inc(`gameplay:hands_resolved:${d}`, 1, YEAR)
      }

      // ── Sport-specific aggregations (used by analytics-read gameplay view) ─
      if (action === 'hand_dealt') {
        await inc(`gameplay:${sport}:hands_dealt:${d}`, 1, YEAR)
      }
      if (action === 'hand_resolved') {
        const bust   = props.bust ?? false
        const score  = Number(props.score ?? 0)
        const badges = Number(props.badgeCount ?? 0)
        const dur    = Number(props.duration_ms ?? 0)
        const tier   = String(props.tier ?? 'BUST').toUpperCase()

        await inc(`gameplay:${sport}:hands_resolved:${d}`, 1, YEAR)
        if (bust) {
          await inc(`gameplay:${sport}:busts:${d}`, 1, YEAR)
        } else {
          await inc(`gameplay:${sport}:wins:${d}`, 1, YEAR)
        }
        if (score > 0)  await inc(`gameplay:${sport}:score_sum:${d}`, Math.round(score), YEAR)
        if (badges > 0) await inc(`gameplay:${sport}:badge_sum:${d}`, badges, YEAR)
        if (dur > 0)    await inc(`gameplay:${sport}:duration_sum:${d}`, Math.round(dur), YEAR)
        if (tier && tier !== 'BUST') {
          await inc(`gameplay:${sport}:tier:${tier}:${d}`, 1, YEAR)
        }
      }
      if (action === 'so_close') {
        await inc(`gameplay:${sport}:so_close:${d}`, 1, YEAR)
      }
      if (action === 'redraw_used') {
        await inc(`gameplay:${sport}:redraws:${d}`, 1, YEAR)
      }
      if (action === 'ftue_completed') {
        await inc(`gameplay:${sport}:ftue_completed:${d}`, 1, YEAR)
      }
    }

    return res.status(200).json({ success: true })
  } catch (err: unknown) {
    console.error('[analytics] Error:', err);
    return res.status(500).json({ error: 'Analytics processing failed' })
  }
}
