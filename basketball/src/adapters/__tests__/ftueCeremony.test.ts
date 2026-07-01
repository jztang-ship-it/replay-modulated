// basketball/src/adapters/__tests__/ftueCeremony.test.ts
//
// ceremonyFtueRoster() pulls the five real 2025-26 First-Team cards from the
// loaded pool by basePlayerId (SGA / Jokić / Wembanyama / Luka / Cade, L→R) and
// is all-or-nothing: a missing player → [] (GameView skips, no partial wall).

import { describe, it, expect, vi } from "vitest";

const FIVE = [
  { basePlayerId: "1628983", season: "2526", name: "Shai Gilgeous-Alexander", team: "OKC", position: "PG", salary: 73, tier: "RED", avgFP: 48.3, projectedFp: 48.3, photoCode: "1628983" },
  { basePlayerId: "203999",  season: "2526", name: "Nikola Jokić",            team: "DEN", position: "C",  salary: 87, tier: "RED", avgFP: 59.9, projectedFp: 59.9, photoCode: "203999" },
  { basePlayerId: "1641705", season: "2526", name: "Victor Wembanyama",       team: "SAS", position: "PF", salary: 76, tier: "RED", avgFP: 49.3, projectedFp: 49.3, photoCode: "1641705" },
  { basePlayerId: "1629029", season: "2526", name: "Luka Dončić",             team: "LAL", position: "SG", salary: 80, tier: "RED", avgFP: 55.5, projectedFp: 55.5, photoCode: "1629029" },
  { basePlayerId: "1630595", season: "2526", name: "Cade Cunningham",         team: "DET", position: "PG", salary: 67, tier: "ORANGE", avgFP: 46.3, projectedFp: 46.3, photoCode: "1630595" },
];

vi.mock("../../engines/dataEngine", () => ({ getPlayers: vi.fn() }));

import { getPlayers } from "../../engines/dataEngine";
import { ceremonyFtueRoster, FTUE_CEREMONY_LINE } from "../ftueScriptedHand";

const getPlayersMock = vi.mocked(getPlayers);

describe("ceremonyFtueRoster", () => {
  it("returns the five First-Team cards in L→R order with real fields", () => {
    getPlayersMock.mockReturnValue([...FIVE, { basePlayerId: "999", name: "Filler", season: "2526", salary: 10, tier: "WHITE", position: "SG" }] as any);
    const cards = ceremonyFtueRoster();
    expect(cards.map((c: any) => c.name)).toEqual([
      "Shai Gilgeous-Alexander", "Nikola Jokić", "Victor Wembanyama", "Luka Dončić", "Cade Cunningham",
    ]);
    const cade = cards[4] as any;
    expect(cade.salary).toBe(67);
    expect(cade.tier).toBe("ORANGE"); // the lone non-RED, odd-card-out
    expect(cade.actualFp).toBe(0);    // no game outcome — a teaching wall
    expect(cade.cardId).toBe("ftue-ceremony-1630595");
    expect((cards[1] as any).slotIndex).toBe(1); // Jokić second, L→R order preserved
  });

  it("is all-or-nothing: a missing player → [] (no partial wall)", () => {
    getPlayersMock.mockReturnValue(FIVE.filter((p) => p.basePlayerId !== "1629029") as any); // drop Luka
    expect(ceremonyFtueRoster()).toEqual([]);
  });

  it("returns [] when the pool isn't loaded (getPlayers throws)", () => {
    getPlayersMock.mockImplementation(() => { throw new Error("dataEngine not loaded"); });
    expect(ceremonyFtueRoster()).toEqual([]);
  });

  it("exposes the verbatim ceremony line unedited", () => {
    expect(FTUE_CEREMONY_LINE).toBe(
      "250 dollar budget to assemble your own dream team, the higher the projected fantasy points(fp) the more expensive player. Show em how its done.",
    );
  });
});
