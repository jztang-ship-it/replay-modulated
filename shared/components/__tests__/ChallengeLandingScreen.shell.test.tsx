// @vitest-environment jsdom
//
// shared/components/__tests__/ChallengeLandingScreen.shell.test.tsx
//
// Phase 2b assert-the-neighbors: the shell's accept-body now delegates
// to ChallengeTakeCardLanding, but the shell still owns fetch /
// loading / error / self-match. This file pins that NONE of the
// neighbor surfaces regressed:
//   - loading state renders while the fetch is in flight,
//   - fetch failure renders the error message and no take-card body,
//   - self-match path still routes to SelfMatchView (NOT the V2
//     landing — self-match is out of scope for the V2 redesign),
//   - accept path on the V2 landing still threads ChallengeCtx through
//     onAccept with normalizeTriggerType applied.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChallengeLandingScreen } from "../ChallengeLandingScreen";

function makeApiResponse(over: Partial<Record<string, unknown>> = {}) {
  return {
    challenge_id: "ch_shell_1",
    created_by: "u_creator",
    challenger_name: "Mike",
    target_score: 142.0,
    sport: "basketball",
    season: "2425",
    trigger_type: "choke",
    share_headline: "",
    initial_roster: {
      v: 1, sport: "basketball", holdsRecorded: true,
      cards: [
        { id: "emb", basePlayerId: "emb", personKey: "emb", cardId: "emb_c",
          name: "Embiid", team: "PHI", season: "2425", position: "C",
          photoCode: null, salary: 80, tier: "RED", slotIndex: 0,
          projectedFp: 50, wasHeld: true, actualFp: 22.0 },
        { id: "voo", basePlayerId: "voo", personKey: "voo", cardId: "voo_c",
          name: "Vucevic", team: "ORL", season: "2425", position: "C",
          photoCode: null, salary: 65, tier: "PURPLE", slotIndex: 1,
          projectedFp: 35, wasHeld: true, actualFp: 18.5 },
        { id: "bro", basePlayerId: "bro", personKey: "bro", cardId: "bro_c",
          name: "Brown", team: "BOS", season: "2425", position: "G",
          photoCode: null, salary: 55, tier: "PURPLE", slotIndex: 2,
          projectedFp: 30, wasHeld: false, actualFp: 0 },
        { id: "cur", basePlayerId: "cur", personKey: "cur", cardId: "cur_c",
          name: "Curry", team: "GSW", season: "2425", position: "G",
          photoCode: null, salary: 75, tier: "RED", slotIndex: 3,
          projectedFp: 42, wasHeld: false, actualFp: 0 },
        { id: "bag", basePlayerId: "bag", personKey: "bag", cardId: "bag_c",
          name: "Bagley", team: "WAS", season: "2425", position: "F",
          photoCode: null, salary: 35, tier: "BLUE", slotIndex: 4,
          projectedFp: 18, wasHeld: false, actualFp: 0 },
        { id: "hol", basePlayerId: "hol", personKey: "hol", cardId: "hol_c",
          name: "Holiday", team: "BOS", season: "2425", position: "G",
          photoCode: null, salary: 25, tier: "GREEN", slotIndex: 5,
          projectedFp: 14, wasHeld: false, actualFp: 0 },
      ],
    },
    roster_size: 6,
    attempt_count: 0,
    winner_count: 0,
    best_score: null,
    best_user_name: null,
    near_miss_gap: null,
    near_miss_next_tier: null,
    anchor_base_player_id: "voo",
    top_game_tier: null,
    ...over,
  };
}

// Trivial sport-adapter stubs — the shell only calls these on
// accept; we don't need real basketball logic to test routing.
const stubDeserialize = (snap: Record<string, unknown>) => {
  const cards = (snap as any).cards ?? [];
  return cards.map((c: any) => ({
    id: c.id, basePlayerId: c.basePlayerId, personKey: c.personKey,
    cardId: c.cardId, name: c.name, team: c.team, season: c.season,
    position: c.position, salary: c.salary, tier: c.tier,
    slotIndex: c.slotIndex, projectedFp: c.projectedFp,
    actualFp: c.actualFp ?? 0, wasHeld: c.wasHeld === true,
    fpDelta: 0, statLine: {}, gameInfo: { date: "", opponent: "" }, achievements: [],
  }));
};
const stubValidate = (_snap: Record<string, unknown>) => true;

beforeEach(() => {
  // Reset fetch between tests.
  // @ts-expect-error global fetch stub
  globalThis.fetch = vi.fn();
  // Clear boss-result memory so a seeded revisit (ch_shell_1) doesn't leak into
  // the accept-path tests (all use the same makeApiResponse challenge_id).
  try { localStorage.clear(); } catch { /* jsdom */ }
});

describe("ChallengeLandingScreen shell — neighbors intact (loading / error / self-match)", () => {
  it("loading state renders while fetch is in flight (no take-card body yet)", () => {
    // Pending fetch — never resolves during this test.
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    render(
      <ChallengeLandingScreen
        challengeId="ch_loading"
        sport="basketball"
        deserializeRoster={stubDeserialize}
        validateRosterSnapshot={stubValidate}
        onAccept={() => {}}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/Loading challenge/i)).toBeTruthy();
    // V2 surface not mounted yet.
    expect(screen.queryByTestId("challenge-take-card-landing")).toBeNull();
  });

  it("fetch failure renders the error message (no take-card body)", async () => {
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404 }));
    render(
      <ChallengeLandingScreen
        challengeId="ch_404"
        sport="basketball"
        deserializeRoster={stubDeserialize}
        validateRosterSnapshot={stubValidate}
        onAccept={() => {}}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByText(/Challenge not found/i)).toBeTruthy());
    expect(screen.queryByTestId("challenge-take-card-landing")).toBeNull();
  });

  it("self-match path renders SelfMatchView, NOT the V2 take-card landing", async () => {
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse({ created_by: "u_me", challenger_name: "Self" })),
    }));
    render(
      <ChallengeLandingScreen
        challengeId="ch_self"
        sport="basketball"
        currentUserId="u_me"
        deserializeRoster={stubDeserialize}
        validateRosterSnapshot={stubValidate}
        onAccept={() => {}}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByText(/This is your challenge/i)).toBeTruthy());
    // V2 surface is gated out for self-match.
    expect(screen.queryByTestId("challenge-take-card-landing")).toBeNull();
  });

  it("non-self viewer renders the V2 take-card landing (delegation works)", async () => {
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse()),
    }));
    render(
      <ChallengeLandingScreen
        challengeId="ch_other"
        sport="basketball"
        currentUserId={null}
        deserializeRoster={stubDeserialize}
        validateRosterSnapshot={stubValidate}
        onAccept={() => {}}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("challenge-take-card-landing")).toBeTruthy());
    // Phase 2c renamed `hook-headline` → `take-headline` in the TAKE
    // → EVIDENCE → DARE rebuild. The shell assertion is the same in
    // spirit (the V2 surface lit up, not the score-first anti-pattern).
    expect(screen.getByTestId("take-headline").textContent?.length).toBeGreaterThan(0);
  });

  it("accept path threads ChallengeCtx through onAccept (CTA → handleAccept → onAccept)", async () => {
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse()),
    }));
    const onAccept = vi.fn();
    render(
      <ChallengeLandingScreen
        challengeId="ch_accept"
        sport="basketball"
        currentUserId={null}
        deserializeRoster={stubDeserialize}
        validateRosterSnapshot={stubValidate}
        onAccept={onAccept}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("accept-cta")).toBeTruthy());
    fireEvent.click(screen.getByTestId("accept-cta"));
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
    const ctx = onAccept.mock.calls[0][0];
    expect(ctx.challengeId).toBe("ch_shell_1");
    expect(ctx.challengerName).toBe("Mike");
    expect(ctx.targetScore).toBe(142.0);
    // Phase 1 alias applies — stored "choke" passes through as "choke".
    expect(ctx.triggerType).toBe("choke");
  });

  it("boss row CONVERGES onto the merged take-card surface (authored identity), NOT the player headline path", async () => {
    // Consolidation Phase 3 step 2: boss + player both render
    // ChallengeTakeCardLanding; the boss branch is gated internally.
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse({
        sender_kind: "boss",
        created_by: null,
        challenger_name: "Banner 18",
        share_headline: "Tatum and Brown finish it",
        trigger_type: "boss",
        tough_day: true,
      })),
    }));
    render(
      <ChallengeLandingScreen
        challengeId="ch_boss"
        sport="basketball"
        currentUserId={null}
        deserializeRoster={stubDeserialize}
        validateRosterSnapshot={stubValidate}
        onAccept={() => {}}
        onClose={() => {}}
      />
    );
    // The unified surface mounts; the boss branch (not the human headline) is shown.
    await waitFor(() => expect(screen.getByTestId("boss-take-card")).toBeTruthy());
    expect(screen.getByTestId("challenge-take-card-landing")).toBeTruthy();
    // Authored boss identity shown verbatim (no real-name "your friend" downgrade).
    expect(screen.getByTestId("boss-name").textContent).toBe("Banner 18");
    expect(screen.getByTestId("boss-flavor").textContent).toBe("Tatum and Brown finish it");
    // Boss-only eyebrow carries the tough-day suffix.
    expect(screen.getByTestId("boss-eyebrow").textContent).toBe("Daily Boss · Tough Day");
    // The human take-card headline / bank path is NOT mounted for a boss.
    expect(screen.queryByTestId("take-headline")).toBeNull();
    // No held/discard treatment — boss cards render neutral.
    expect(screen.queryByTestId("hand-card-held")).toBeNull();
    expect(screen.queryAllByTestId("hand-card-neutral").length).toBe(6);
  });

  it("boss REVISIT (already played today) reconstructs the outward ending, not the accept CTA", async () => {
    const { recordBossResult } = await import("@shared/utils/bossResultMemory");
    recordBossResult("ch_shell_1", { score: 215.0, won: false });
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse({
        sender_kind: "boss", created_by: null, challenger_name: "Banner 18", trigger_type: "boss",
      })),
    }));
    render(
      <ChallengeLandingScreen
        challengeId="ch_boss_revisit"
        sport="basketball"
        currentUserId={null}
        deserializeRoster={stubDeserialize}
        validateRosterSnapshot={stubValidate}
        onAccept={() => {}}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("boss-outward-ending")).toBeTruthy());
    // Revisit branch ported into the merged surface (boss-gated).
    expect(screen.getByTestId("boss-take-card")).toBeTruthy();
    // Outward ending reconstructed from memory; no re-accept CTA.
    expect(screen.getByText(/TODAY'S BOSS GOT YOU/)).toBeTruthy();
    expect(screen.queryByTestId("accept-cta")).toBeNull();
  });

  it("boss accept threads senderKind:'boss' through onAccept", async () => {
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse({
        sender_kind: "boss", created_by: null, challenger_name: "Banner 18", trigger_type: "boss",
      })),
    }));
    const onAccept = vi.fn();
    render(
      <ChallengeLandingScreen
        challengeId="ch_boss_accept"
        sport="basketball"
        currentUserId={null}
        deserializeRoster={stubDeserialize}
        validateRosterSnapshot={stubValidate}
        onAccept={onAccept}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("accept-cta")).toBeTruthy());
    expect(screen.getByTestId("accept-cta").textContent).toBe("Take the Boss");
    fireEvent.click(screen.getByTestId("accept-cta"));
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
    const ctx = onAccept.mock.calls[0][0];
    expect(ctx.senderKind).toBe("boss");
    expect(ctx.challengerName).toBe("Banner 18");
  });

  it("MARQUEE boss shows the 'brutal by design' label pre-play; beatable does not (Step 4)", async () => {
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse({
        sender_kind: "boss", created_by: null, challenger_name: "73-9 Warriors", trigger_type: "boss",
        initial_roster: { ...makeApiResponse().initial_roster, marquee: true },
      })),
    }));
    const { unmount } = render(
      <ChallengeLandingScreen
        challengeId="ch_boss_marquee" sport="basketball" currentUserId={null}
        deserializeRoster={stubDeserialize} validateRosterSnapshot={stubValidate}
        onAccept={() => {}} onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("boss-take-card")).toBeTruthy());
    expect(screen.getByText(/brutal by design/i)).toBeTruthy();
    unmount();

    // Beatable boss (no marquee) → no label.
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse({
        sender_kind: "boss", created_by: null, challenger_name: "Banner 18", trigger_type: "boss",
      })),
    }));
    render(
      <ChallengeLandingScreen
        challengeId="ch_boss_beatable" sport="basketball" currentUserId={null}
        deserializeRoster={stubDeserialize} validateRosterSnapshot={stubValidate}
        onAccept={() => {}} onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("boss-take-card")).toBeTruthy());
    expect(screen.queryByText(/brutal by design/i)).toBeNull();
  });

  it("boss accept threads marquee through onAccept (Step 4)", async () => {
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse({
        sender_kind: "boss", created_by: null, challenger_name: "73-9 Warriors", trigger_type: "boss",
        initial_roster: { ...makeApiResponse().initial_roster, marquee: true },
      })),
    }));
    const onAccept = vi.fn();
    render(
      <ChallengeLandingScreen
        challengeId="ch_boss_marquee_accept" sport="basketball" currentUserId={null}
        deserializeRoster={stubDeserialize} validateRosterSnapshot={stubValidate}
        onAccept={onAccept} onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("accept-cta")).toBeTruthy());
    fireEvent.click(screen.getByTestId("accept-cta"));
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
    expect(onAccept.mock.calls[0][0].marquee).toBe(true);
  });

  it("player row threads senderKind:'player' (unchanged path)", async () => {
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse()),
    }));
    const onAccept = vi.fn();
    render(
      <ChallengeLandingScreen
        challengeId="ch_player_kind"
        sport="basketball"
        currentUserId={null}
        deserializeRoster={stubDeserialize}
        validateRosterSnapshot={stubValidate}
        onAccept={onAccept}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("accept-cta")).toBeTruthy());
    fireEvent.click(screen.getByTestId("accept-cta"));
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
    expect(onAccept.mock.calls[0][0].senderKind).toBe("player");
  });

  it("legacy 'bad_beat' row routes through normalizeTriggerType → ctx.triggerType === 'choke'", async () => {
    // @ts-expect-error global fetch stub
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true, json: () => Promise.resolve(makeApiResponse({ trigger_type: "bad_beat" })),
    }));
    const onAccept = vi.fn();
    render(
      <ChallengeLandingScreen
        challengeId="ch_legacy"
        sport="basketball"
        currentUserId={null}
        deserializeRoster={stubDeserialize}
        validateRosterSnapshot={stubValidate}
        onAccept={onAccept}
        onClose={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("accept-cta")).toBeTruthy());
    fireEvent.click(screen.getByTestId("accept-cta"));
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
    expect(onAccept.mock.calls[0][0].triggerType).toBe("choke");
  });
});
