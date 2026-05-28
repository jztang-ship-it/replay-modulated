/**
 * Contract-lock tests for serializeResolvedRoster.
 *
 * The helper is consumed by two write paths (hand_log.final_roster on the
 * sender side; challenge_attempts.score_breakdown +
 * user_notifications.payload.attempter_roster on the recipient side).
 * Both reads on the other side decode the blob as GeneratedCard[], so the
 * shape must stay frozen — additions to GeneratedCard must update the
 * picker intentionally.
 */
import { describe, it, expect } from "vitest";
import { serializeResolvedRoster } from "../resolvedRosterSerialization";

describe("serializeResolvedRoster", () => {
  it("picks the locked field set and coerces primitives", () => {
    const blob = serializeResolvedRoster([
      {
        id: "p1",
        basePlayerId: "p1",
        personKey: "p1",
        cardId: "p1_card",
        name: "Allen Iverson",
        team: "PHI",
        season: "9899",
        position: "PG",
        photoCode: "iverso01",
        salary: 75,
        tier: "RED",
        projectedFp: 40,
        slotIndex: 0,
        wasHeld: true,
        actualFp: 52.3,
        fpDelta: 12.3,
        gameInfo: { date: "1999-03-15", opponent: "BOS", homeAway: "home" },
        statLine: { pts: 35, reb: 5, ast: 8 },
        achievements: [{ id: "GOD_MODE", icon: "🔥", label: "GOD MODE", fp: 15 }],
        // Field NOT in the locked shape; must be dropped.
        bogusExtraField: "should not survive",
      },
    ]);

    expect(blob).toHaveLength(1);
    const card = blob[0];

    // Locked field set (matches GeneratedCard, shared/types/index.ts:178-186)
    expect(Object.keys(card).sort()).toEqual([
      "achievements", "actualFp", "basePlayerId", "cardId", "fpDelta",
      "gameInfo", "id", "name", "personKey", "photoCode", "position",
      "projectedFp", "salary", "season", "slotIndex", "statLine", "team",
      "tier", "wasHeld",
    ]);
    expect(card.id).toBe("p1");
    expect(card.salary).toBe(75);
    expect(card.tier).toBe("RED");
    expect(card.wasHeld).toBe(true);
    expect(card.gameInfo).toEqual({ date: "1999-03-15", opponent: "BOS", homeAway: "home" });
    expect(card.statLine).toEqual({ pts: 35, reb: 5, ast: 8 });
    expect(card.achievements).toHaveLength(1);
    // Unknown field MUST be dropped — the picker is explicit, not pass-through.
    expect((card as any).bogusExtraField).toBeUndefined();
  });

  it("supplies safe defaults for missing fields", () => {
    const blob = serializeResolvedRoster([{}]);
    const card = blob[0];

    expect(card.id).toBe("");
    expect(card.personKey).toBe(""); // falls back to basePlayerId then ""
    expect(card.cardId).toBe("");    // falls back to id then ""
    expect(card.photoCode).toBeNull();
    expect(card.salary).toBe(0);
    expect(card.tier).toBe("WHITE");
    expect(card.wasHeld).toBe(false);
    expect(card.gameInfo).toEqual({ date: "", opponent: "" });
    expect(card.statLine).toEqual({});
    expect(card.achievements).toEqual([]);
  });

  it("omits gameInfo.homeAway when not present (rather than emitting undefined)", () => {
    const blob = serializeResolvedRoster([
      { gameInfo: { date: "2025-01-01", opponent: "XYZ" } },
    ]);
    expect("homeAway" in (blob[0].gameInfo as any)).toBe(false);
  });

  it("coerces wasHeld strictly — only literal true counts as held", () => {
    const blob = serializeResolvedRoster([
      { wasHeld: true },
      { wasHeld: 1 as any },
      { wasHeld: "true" as any },
      { wasHeld: undefined },
    ]);
    expect(blob.map(c => c.wasHeld)).toEqual([true, false, false, false]);
  });

  it("preserves array order (slot order is meaningful for the reveal arc)", () => {
    const blob = serializeResolvedRoster([
      { id: "a", slotIndex: 0 },
      { id: "b", slotIndex: 1 },
      { id: "c", slotIndex: 2 },
    ]);
    expect(blob.map(c => c.id)).toEqual(["a", "b", "c"]);
  });

  it("round-trips through JSON.stringify (JSONB-safe)", () => {
    const blob = serializeResolvedRoster([
      {
        id: "p1", name: "Test", salary: 50, tier: "PURPLE",
        gameInfo: { date: "2025-01-01", opponent: "XYZ" },
        statLine: { pts: 20 }, achievements: [],
      },
    ]);
    const roundTripped = JSON.parse(JSON.stringify(blob));
    expect(roundTripped).toEqual(blob);
  });
});
