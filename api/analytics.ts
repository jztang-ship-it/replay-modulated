import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

const YEAR = 60 * 60 * 24 * 365

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

    // Support both batch (array) and single event payloads
    const events = Array.isArray(body) ? body : (body?.events ?? [body])

    if (!events.length) {
      return res.status(400).json({ error: 'Missing events' })
    }

    const d = new Date().toISOString().slice(0, 10)

    for (const evt of events) {
      if (!evt) continue
      const feature = String(evt.feature ?? '')
      const action  = String(evt.action ?? evt.event ?? '')

      // Map feature/action -> storage keys
      if (feature === 'gameplay' || action === 'hands_dealt') {
        await inc(`gameplay:hands_dealt:${d}`, 1, YEAR)
      }
      if (action === 'hand_resolved' || action === 'game_won') {
        const bust = evt.props?.bust ?? evt.bust
        if (!bust) await inc(`gameplay:wins:${d}`, 1, YEAR)
        await inc(`gameplay:hands_resolved:${d}`, 1, YEAR)
      }
      if (feature === 'session' && action === 'session_end') {
        await inc(`gameplay:sessions:${d}`, 1, YEAR)
      }
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(400).json({ error: 'Invalid payload' })
  }
}
