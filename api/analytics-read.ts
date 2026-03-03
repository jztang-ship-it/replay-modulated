/**
 * api/analytics-read.ts — Dashboard data API
 * GET /api/analytics-read?key=ADMIN_KEY&view=overview&days=7
 * Views: overview | gameplay | retention | social | errors | raw
 */

import type { VercelRequest, VercelRespon } from '@vercel/node';
import { kv } from '@vercel/kv';

const DAY_MS = 86400000;
const YEAR = 31536000;

function dateRange(days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * DAY_MS);
    return d.toISOString().slice(0, 10);
  });
}

async function n(key: string): Promise<number> { return (await kv.get<number>(key)) ?? 0; }

async function viewOverview(days: number) {
  const dates = dateRange(days);
  const sports = ['basketball', 'worldcup', 'football', 'nfl', 'hockey'];
  const [totalEvents, totalHands] = await Promise.all([
    n('agg:total:events'),
    Promise.all(dates.map(d => n('gameplay:hands_dealt:' + d))).then(v => v.reduce((a,b)=>a+b,0)),
  ]);
  const [busts, wins, newUsers, returningUsers] = await Promise.all([
    Promise.all(sports.flatMap(p => dates.map(d => n('gameplay:' + p + ':busts:' + d)))).then(v => v.reduce((a,b)=>a+b,0)),
    Promise.all(sports.flatMap(p => dates.map(d => n('gameplay:' + p + ':wins:' + d)))).then(v => v.reduce((a,b)=>a+b,0)),
    Promise.all(dates.map(d => n('new_users:' + d))).then(v => v.reduce((a,b)=>a+b,0)),
    Promise.all(dates.map(d => n('returning_users:' + d))).then(v => v.reduce((a,b)=>a+b,0)),
  ]);
  const totalResolved = busts + wins;
  const dauByDay = await Promise.all(dates.map(async d => ({ date: d, dau: await kv.zcard('dau:' + d) })));
  const handsByDay = await Promise.all(dates.map(async d => ({ date: d, hands: await n('gameplay:hands_dealt:' + d) })));
  return {
    summary: {
      totalEvents, totalHands, busts, wins,
      bustRate: totalResolved > 0 ? +((busts/totalResolved)*100).toFixed(1) : 0,
      newUsers, returningUsers,
      retentionRate: (newUsers+returningUsers) > 0 ? +(returningUsers/(newUsers+returningUsers)*100).toFixed(1) : 0,
    },
    dauByDay, handsByDay,
  };
}

async function viewGameplay(product: string, days: number) {
  const dates = dateRange(days);
  const tiers = ['MVP','ALL_STAR','STARTER','ROOKIE','NONE'];
  const dailyStats = await Promise.all(dates.map(async d => {
    const [dealt,resolved,busts,wins,scoreSum,badgeSum,durationSum,soClose] = await Promise.all([
      n('gameplay:'+product+':hands_dealt:'+d), n('gameplay:'+product+':hands_resolved:'+d),
      n('gameplay:'+product+':busts:'+d), n('gameplay:'+product+':wins:'+d),
      n('gameplay:'+product+':score_sum:'+d), n('gameplay:'+product+':badge_sum:'+d),
      n('gameplay:'+product+':duration_sum:'+d), n('gameplay:'+product+':so_close:'+d),
    ]);
    const tierHits = Object.fromEntries(await Promise.all(tiers.map(async t => [t, await n('gameplay:'+product+':tier:'+t+':'+d)])));
    return { date:d, dealt, resolved, busts, wins, soClose, tierHits,
      bustRate: resolved>0 ? +((busts/resolved)*100).toFixed(1) : 0,
      avgScore: resolved>0 ? +(scoreSum/resolved).toFixed(1) : 0,
      avgBadges: resolved>0 ? +(badgeSum/resolved).toFixed(2) : 0,
      avgDuration: resolved>0 ? +(durationSum/resolved).toFixed(0) : 0,
    };
  }));
  const totals = dailyStats.reduce((a,d) => ({
    dealt:a.dealt+d.dealt, resolved:a.resolved+d.resolved,
    busts:a.busts+d.busts, wins:a.wins+d.wins, soClose:a.soClose+d.soClose,
  }), {dealt:0,resolved:0,busts:0,wins:0,soClose:0});
  const sessionStats = await Promise.all(dates.map(async d => {
    const [count,handsSum,durationSum] = await Promise.all([
      n('sessions:'+product+':'+d+':count'), n('sessions:'+product+':'+d+':hands_sum'), n('sessions:'+product+':'+d+':duration_sum'),
    ]);
    return { date:d, sessions:count, avgHandsPerSession:count>0?+(handsSum/count).toFixed(1):0, avgSessionMins:count>0?+(durationSum/count/60).toFixed(1):0 };
  }));
  return { product, days, dailyStats, totals, sessionStats };
}

async function viewRetention(days: number) {
  const dates = dateRange(days);
  const cohortData = await Promise.all(dates.map(async d => ({
    date:d,
    newUsers: await n('new_users:'+d),
    returningUsers: await n('returning_users:'+d),
    dau: await kv.zcard('dau:'+d),
  })));
  return { days, cohortData };
}

async function viewSocial(days: number) {
  const dates = dateRange(days);
  const dailyStats = await Promise.all(dates.map(async d => ({
    date:d,
    comments: await n('social:comments:'+d),
    likes: await n('social:likes:'+d),
    challengesSent: await n('pvp:challenges_sent:'+d),
    challengesAccepted: await n('pvp:challenges_accepted:'+d),
    newsViews: await n('news:views:'+d),
    newsShares: await n('news:shares:'+d),
  })));
  return { days, dailyStats };
}

async function viewErrors(days: number) {
  const dates = dateRange(days);
  const dailyErrors = await Promise.all(dates.map(async d => ({ date:d, errors: await n('errors:'+d) })));
  return { days, dailyErrors };
}

async function viewRaw(date: string, limit: number) {
  const keys = await kv.keys('events:'+date+':*');
  const limited = keys.slice(0, Math.min(limit, 500));
  const events = limited.length > 0 ? await kv.mget(...limited) : [];
  return { date, count: keys.length, events };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const adminKey = process.env.ANALYTICS_ADMIN_KEY;
  if (!adminKey || req.query.key !== adminKey) return res.status(401).json({ error: 'Unauthorized' });
  const view = String(req.query.view ?? 'overview');
  const product = String(req.query.product ?? 'basketball');
  const days = Math.min(parseInt(String(req.query.days ?? '7'), 10), 90);
  const date = String(req.query.date ?? new Date().toISOString().slice(0,10));
  const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10), 500);
  res.setHeader('Cache-Control', 's-maxage=60');
  try {
    switch (view) {
      case 'overview':  return res.json(await viewOverview(days));
      case 'gameplay':  return res.json(await viewGameplay(product, days));
      case 'retention': return res.json(await viewRetention(days));
      case 'social':
      case 'news':      return res.json(await viewSocial(days));
      case 'errors':    return res.json(await viewErrors(days));
      case 'raw':       return res.json(await viewRaw(date, limit));
      default:          return res.status(400).json({ error: 'Unknown view: ' + view });
    }
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Internal error' }); }
}
