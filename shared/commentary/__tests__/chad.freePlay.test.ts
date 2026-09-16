import { describe, expect, it } from "vitest";
import { chadBank, type ChadTopic } from "../chad";

const TOPICS: ChadTopic[] = [
  "welcome", "daily_return", "win_back", "streak_intro", "rookie_first_win",
  "leaderboard_intro", "leaderboard_explainer", "big_win", "retention",
  "mvp_thanks", "dev_4thwall",
];

describe("free-play Chad commentary", () => {
  it("contains no wager or economy framing", () => {
    for (const topic of TOPICS) {
      for (const line of chadBank(topic, true)) {
        expect(line).not.toMatch(/\b(?:coin|coins|bet|bets|payout|payouts|pool|paid|money|rent)\b/i);
      }
    }
  });
});
