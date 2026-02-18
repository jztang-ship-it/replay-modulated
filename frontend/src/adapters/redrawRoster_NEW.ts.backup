// Paste this function to REPLACE the existing redrawRoster in gameAdapter.ts
// Lines 631-750

export async function redrawRoster(args: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<{ cards: PlayerCard[]; capMax: number }> {
  const { players, logs } = await ensureDataLoaded();
  const rng = mulberry32(_seed++);

  const locked = args.currentCards.filter((c) => args.lockedCardIds.has(c.cardId));
  const lockedBase = new Set(locked.map((c) => c.basePlayerId));
  const slotsNeeded = ROSTER_SIZE - locked.length;

  const pool = players.filter((p) => !lockedBase.has(baseId(p)));
  const fresh = generateRosterSculpted(pool, rng).map(buildCard).slice(0, slotsNeeded);
  const merged = [...locked, ...fresh];

  for (const card of merged) {
    if (args.lockedCardIds.has(card.cardId)) continue;
    const log = pickRandomLogForCard(card.cardId, logs, rng, card.basePlayerId);
    if (!log) continue;
    const actualFp = computeFantasyPointsFromLog(log) * 10;
    card.actualFp = actualFp;
    card.fpDelta = actualFp - (card.projectedFp ?? 0);
    card.statLine = log.stats ?? {};
    card.gameInfo = { date: log.date ?? "", opponent: log.opponent ?? "", homeAway: log.homeAway ?? undefined };
  }

  return { cards: merged, capMax: CAP_MAX };
}
