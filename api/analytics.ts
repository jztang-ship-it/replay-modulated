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
    const { event, date } = body ?? {}

    if (!event || !date) {
      return res.status(400).json({ error: 'Missing event or date' })
    }

    const d = String(date)

    if (event === 'hands_dealt') {
      await inc(`gameplay:hands_dealt:${d}`, 1, YEAR)
    } else if (event === 'game_won') {
      await inc(`gameplay:wins:${d}`, 1, YEAR)
    } else if (event === 'challenge_sent') {
      await inc(`pvp:challenges_sent:${d}`, 1, YEAR)
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(400).json({ error: 'Invalid payload' })
  }
}
