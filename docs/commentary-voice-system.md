# ReplayMod Commentary Voice System (CANONICAL)

**This is the source of truth for Chad's voice across every surface and every sport.** Edit here first; operational files implement it (see §8). Locked guardrails inherited from the May 17–18 voice-spec session (Norman Chad + 25% spicier; 10 defamation cuts applied).

---

## 1. Who Chad is (universal)

Chad is the commentator voice of ReplayMod: **Norman Chad at a sportsbook with one more drink than he should have.** Knowing, opinionated, willing to take sides. Not a homer, not a hater, not a screamer. He's watched enough of the sport to have takes and refuses to pretend he doesn't. The bar for a casual fan reading him is "Chad gets me" — he flatters their knowledge and lands the one-liner, never lectures.

**Audience:** sports fans who know the history. Reference the lore without footnotes. If a user doesn't catch it, they'll Google it. Lines that flatter knowledge work; lines that explain it don't.

---

## 2. Universal rules (every line, every surface, every sport)

- **The dial — every line carries a take, not just a fact.** Bar to clear: would a sports fan retweet this? Facts get scrolled; opinions get arguments. Aim for the second.
- **Structure — two clauses.** Setup, then editorial twist. Setup is the descriptor; twist is Chad's commentary on it.
- **Length — 12–22 words, 90-char hard ceiling.** Brevity is part of the voice. (Nudge/CTA surfaces run shorter — see F4.)
- **Confidence — no hedging.** Cut "some say," "many would argue," "it could be said." Chad either makes the argument or doesn't.
- **Specificity — anchor with at least one concrete.** A number, date, opponent, or event. "At 40," "since 2018," "twelve missed free throws in '04."
- **Clean — spicy comes from confidence, not edge.** No profanity, no violence metaphors, nothing that wouldn't run in a beer commercial.

Sport-specific *vocabulary, lore, and examples* live in the per-sport voice modules (§8), not here. This section is the constant.

---

## 3. Hard guardrails (LOCKED — do not soften)

- **Confine criticism to the sport** — playing style, draft, contracts, trades, coaching, on-court controversies. **Off-limits:** marriages, partners, domestic incidents, paternity, addiction details, tabloid storylines.
- **Criminal records / arrests / DUIs** — off-limits unless they produced a league suspension or on-court incident (then it's sport-relevant).
- **Substance use** — off-limits unless tied to a documented league penalty.
- **Mental health** — off-limits unless the player has spoken publicly about it in a sport-relevant context. (This is the only reason DeRozan's advocacy line is permitted.)
- **The broadcast test:** if a fact wouldn't be said during a live broadcast of an ongoing game, it doesn't belong.
- **Trademark:** team/league/player names are nominative editorial use only. Never imply endorsement, sponsorship, partnership, or affiliation. Avoid "officially / endorsed by / in partnership with / sponsored by / brand ambassador" in any affiliation sense (editorial "officially arrived as a star" is fine).

---

## 4. Frame rules (selection banks vs. culture entries)

Culture entries are 3rd-person ABOUT a player (generated from the per-sport voice module). **Frames** are the hand-authored selection-bank lines in `chadChallenge.ts` that wrap a runtime-chosen `{cultureLine}`. They follow §2–3 PLUS:

- **F1 — Second person.** Frames talk TO the recipient, trash-talking the sender's hand. The 3rd-person player take is the `{cultureLine}`'s job.
- **F2 — Graceful handoff.** `{cultureLine}` is randomly chosen; the frame must read clean in front of or behind ANY culture line. Never assume its content. The seam is the #1 robotic tell.
- **F3 — No gamified jargon.** Banned: "lock in your reads," "cook it," "your turn at the wheel," "run it back," bare "Draw." as a sentence. Chad doesn't speak in UI verbs.
- **F4 — Nudge surfaces** (Stage 2 / CTA-adjacent) run shorter than 12–22 words but still carry a take, never a naked command.

---

## 5. Voice register vs. magnitude

Two different things people call "intensity":

- **Register (free, copy-only):** how loud the wording is. Edit the bank line. Always available, no plumbing.
- **Magnitude self-scaling (F5 — deferred, plumbing):** banks auto-selecting a louder line for a blowout vs. a flatter one for a squeaker. Normal commentary already does this (10 intensity tiers → tone selection). The recipient intro does NOT — it's score-blind today. Adding it = thread magnitude into the selector + band the banks. Known move, clean follow-up, not in v1.

---

## 6. Surface map (every consumer of the voice)

| Surface | File | Voice source | Status |
|---|---|---|---|
| Culture entries (the DB) | per-sport `playerCulture.ts` | generated from per-sport voice module | spec'd, mostly compliant; weak-line scan pending |
| Normal post-reveal commentary | `selectCommentary.ts` + `libraries/*.json` + `RESULT_FRAMING` / `CHAD_ANALOGIES` | §2–3 | not yet held to spec; "too short" lever lives in composition modes |
| Recipient intro + deal nudge | `chadChallenge.ts` `INTRO_*` / `NUDGE_*` | §2–4 | **v1 rewritten — see §7** |
| Challenge trash talk / initiation / resolution / top-slot framing / rivalry-back | `chadChallenge.ts` | §2–4 | not yet held to spec (next surfaces) |
| FTUE Chad (welcome, daily-return, etc.) | `chad.ts` | §2–3 | not yet held to spec |

Anti-repeat is per-surface and separate (normal commentary = localStorage `antiRepeat.ts`; chad challenge = local 8-deep ring; FTUE = none). Not a voice concern, but don't assume cross-surface dedup.

---

## 7. APPLIED v1 — recipient-intro + nudge frame rewrites

Paste-ready `Line[]`. Tokens and `StampToken` shapes match the current selector contract — **no plumbing change**, pure copy.

### Stage 1 — `INTRO_*`

```ts
const INTRO_BAD_BEAT_CULTURE: Line[] = [
  ["{challengerName} bet the whole hand on {name} and still got buried — ", { stamp: "bad_beat" }, ". {cultureLine} Same six cards are right here."],
  ["{challengerName} held {name} and watched {targetScore} come up short. ", { stamp: "bad_beat" }, " — {cultureLine} See if you read it cleaner."],
  ["The conviction pick was {name}, and the conviction was misplaced — ", { stamp: "bad_beat" }, ". {cultureLine} Your hand now."],
  ["{challengerName} leaned the whole {targetScore} on {name} and it tipped over. ", { stamp: "bad_beat" }, " — {cultureLine}"],
  [{ stamp: "bad_beat" }, ". {challengerName} trusted {name} and got {targetScore} for it. {cultureLine} You get the better look."],
  ["{cultureLine} That's the {name} {challengerName} hung {targetScore} on — ", { stamp: "bad_beat" }, ". Your shot at the same slate."],
];

const INTRO_BAD_BEAT_NAME: Line[] = [
  ["{challengerName} held {name} and the rest of the hand quit on him — ", { stamp: "bad_beat" }, ", {targetScore} on the board. Beat it."],
  ["{name} was supposed to be the safe one. ", { stamp: "bad_beat" }, " — {challengerName} settled for {targetScore}."],
  ["Premium pick, premium letdown. {challengerName} rode {name} to a ", { stamp: "bad_beat" }, " and left you {targetScore} to chase."],
  [{ stamp: "bad_beat" }, ". {challengerName} stacked {name} for {targetScore} and the math never showed. Same six cards."],
  ["{challengerName} bet big on {name} and walked off with {targetScore} — ", { stamp: "bad_beat" }, ". Your hand to fix it."],
];

const INTRO_BAD_BEAT_GENERIC: Line[] = [
  ["{challengerName} got cooked by his own holds — ", { stamp: "bad_beat" }, ", {targetScore} on the board. Do better."],
  [{ stamp: "bad_beat" }, ". {challengerName} couldn't drag the same six past {targetScore}. Your turn to try."],
  ["Looked like a winner on paper for {challengerName}. ", { stamp: "bad_beat" }, " — {targetScore} is what it actually paid."],
  ["{challengerName} read the slate; the slate didn't read the script — ", { stamp: "bad_beat" }, ", {targetScore} to beat."],
];

const INTRO_BIG_SCORE_CULTURE: Line[] = [
  ["{name} went off and {challengerName} was holding the ticket — ", { stamp: "win_tier" }, ". {cultureLine} {targetScore} to clear."],
  ["{challengerName} stacked {name} on exactly the right night — ", { stamp: "win_tier" }, ". {cultureLine} Same six cards, {targetScore} on the board."],
  ["{cultureLine} That's the night {name} put {challengerName} at {targetScore} — ", { stamp: "win_tier" }, ". Your move."],
  [{ stamp: "win_tier" }, ". {name} took the building down for {challengerName}. {cultureLine} {targetScore} to beat."],
  ["{name} ate; {challengerName} ate right after — ", { stamp: "win_tier" }, ", {targetScore} on the receipt. {cultureLine}"],
];

const INTRO_BIG_SCORE_NAME: Line[] = [
  ["{name} cooked and {challengerName} was sitting at the table — ", { stamp: "win_tier" }, ", {targetScore} on the board. Same six."],
  ["{challengerName} put the right name on the right night. {name} delivered — ", { stamp: "win_tier" }, ", {targetScore} to clear."],
  [{ stamp: "win_tier" }, ". {name} carried the hand for {challengerName} and left you {targetScore} to answer."],
  ["{name} torched the slate and {challengerName} cleared {targetScore} — ", { stamp: "win_tier" }, ". Your move."],
];

const INTRO_BIG_SCORE_GENERIC: Line[] = [
  ["{challengerName} caught the whole slate hot — ", { stamp: "win_tier" }, ", {targetScore} on the board."],
  [{ stamp: "win_tier" }, ". {challengerName} stacked the right names and got paid. {targetScore} to beat."],
  ["The whole hand ran for {challengerName} — ", { stamp: "win_tier" }, ", {targetScore} is what it returned."],
  ["{challengerName} hung {targetScore} on these cards — ", { stamp: "win_tier" }, ". Your turn to match it."],
];

const INTRO_RARE_PULL_CULTURE: Line[] = [
  ["{name} did something the box score had to double-check for {challengerName} — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ". {cultureLine} {targetScore} to chase."],
  ["{cultureLine} {name} carved {challengerName} into the record sheet — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ", {targetScore} to chase."],
  [{ stamp: "rare_pull", tier: "{rarePullTier}" }, ". {name} hung a number on the whole league for {challengerName}. {cultureLine} {targetScore} on the receipt."],
  ["{challengerName} caught {name} on the night the stat sheet broke — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ". {cultureLine} {targetScore} is the bar."],
  ["{name} made the highlight reel and {challengerName} cashed it — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ". {cultureLine} {targetScore} to clear."],
];

const INTRO_RARE_PULL_NAME: Line[] = [
  ["{name} did something the league hadn't seen in years, and {challengerName} had the ticket — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ", {targetScore} to chase."],
  [{ stamp: "rare_pull", tier: "{rarePullTier}" }, ". {name} carved {challengerName} into the record books at {targetScore}. Same six cards."],
  ["{challengerName} caught {name} on the night the stat sheet broke — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ", {targetScore} on the board."],
  ["{name} hung a historic number for {challengerName} — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ", {targetScore} is the bar."],
];

const INTRO_RARE_PULL_GENERIC: Line[] = [
  ["{challengerName} caught one of those nights — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ", {targetScore} on the receipt."],
  [{ stamp: "rare_pull", tier: "{rarePullTier}" }, ". The slate handed {challengerName} a number people screenshot. {targetScore} to chase."],
  ["The whole hand ran historic for {challengerName} — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ", {targetScore} is what it paid."],
];

const INTRO_MISS_WITH_GAP: Line[] = [
  ["{challengerName} put up {targetScore} and stalled — ", { stamp: "miss", tier: "{nearMissNextTier}" }, ", {nearMissGap} FP from the next tier. Take it from him."],
  ["{nearMissGap} FP from a different conversation for {challengerName}. ", { stamp: "miss", tier: "{nearMissNextTier}" }, " — {targetScore} on the board. Your turn."],
  [{ stamp: "miss", tier: "{nearMissNextTier}" }, ". {challengerName} left {nearMissGap} FP on the floor at {targetScore}. Find the cleaner read."],
  ["{challengerName} bumped the cut line and slid back — ", { stamp: "miss", tier: "{nearMissNextTier}" }, ", {nearMissGap} FP short. {targetScore} to clear."],
];

const INTRO_MISS_GENERIC: Line[] = [
  ["{challengerName} got close and no closer — ", { stamp: "miss" }, ", {targetScore} on the board. Your shot."],
  [{ stamp: "miss" }, ". {challengerName} walked it right up to the door at {targetScore}. Door stayed shut."],
  ["{challengerName} was a possession from a different night — ", { stamp: "miss" }, ", {targetScore} to chase."],
];

const INTRO_DEFAULT: Line[] = [
  ["{challengerName} played the slate and walked with {targetScore}. Same six cards — see what you've got."],
  ["{targetScore} on the board from {challengerName}. Your move."],
  ["{challengerName} sent {targetScore}. Same cards, your shot."],
];
```

### Stage 2 — `NUDGE_*`

```ts
const NUDGE_BAD_BEAT_CULTURE: Line[] = [
  ["{challengerName} already found the trap door. ", { stamp: "bad_beat" }, " — {cultureLine} Your draw."],
  ["Hold what {challengerName} wishes he had. {cultureLine}"],
  ["{name} sank {challengerName} once — ", { stamp: "bad_beat" }, ". {cultureLine} Hold smarter."],
];

const NUDGE_BAD_BEAT_NAME: Line[] = [
  ["Hold {name} — {challengerName} did, and ate a ", { stamp: "bad_beat" }, " for it. Your draw to fix it."],
  ["{challengerName} got cooked by {name}. Pick the holds he should have."],
  ["Hold what {challengerName} didn't. ", { stamp: "bad_beat" }, " says he guessed wrong."],
];

const NUDGE_BAD_BEAT_GENERIC: Line[] = [
  ["{challengerName}'s board already broke — ", { stamp: "bad_beat" }, ". Your draw."],
  ["Pick the holds and redeem the slate {challengerName} fumbled."],
  ["Hold sharper than {challengerName} did. That's the whole game."],
];

const NUDGE_BIG_SCORE_CULTURE: Line[] = [
  ["{challengerName} caught {name} on the right night. {cultureLine} Match it."],
  ["Hold the heater — ", { stamp: "win_tier" }, " on {name}. {cultureLine} Your draw."],
  ["{cultureLine} Stack like {challengerName} did and see if it repeats."],
];

const NUDGE_BIG_SCORE_NAME: Line[] = [
  ["Hold {name} like {challengerName} did — ", { stamp: "win_tier" }, ". Your draw."],
  ["{name} cooked for {challengerName}. Catch the same fire."],
  ["Stack the right name. {targetScore} is the number."],
];

const NUDGE_BIG_SCORE_GENERIC: Line[] = [
  ["{challengerName} found the heat — ", { stamp: "win_tier" }, " to clear. Your draw."],
  ["Stack the right names and chase {targetScore}."],
  ["Hold sharper than {challengerName} and the number's yours."],
];

const NUDGE_RARE_PULL_CULTURE: Line[] = [
  ["Hold the history card. {cultureLine} Your draw."],
  ["Lock {name} — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ". {cultureLine} Go."],
  ["{cultureLine} Stack {name} and chase the ghost."],
];

const NUDGE_RARE_PULL_NAME: Line[] = [
  ["Hold {name} — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " says it was special. Your draw."],
  ["{name} did it for {challengerName}. See if lightning repeats."],
  ["Stack {name}. {targetScore} to chase."],
];

const NUDGE_RARE_PULL_GENERIC: Line[] = [
  [{ stamp: "rare_pull", tier: "{rarePullTier}" }, " to chase. Pick your holds."],
  ["Hold sharper than {challengerName} — {targetScore} on the board."],
  ["Stack the slate and chase the number."],
];

const NUDGE_MISS: Line[] = [
  ["{challengerName} fell a hair short. Your draw to clear it."],
  ["Hold tighter than {challengerName} did — {targetScore}'s right there."],
  ["Pick your reads and push past {targetScore}."],
];

const NUDGE_DEFAULT: Line[] = [
  ["Pick your holds — {targetScore} on the board. Your draw."],
  ["Hold what you trust and pass {challengerName}."],
  ["{targetScore} to clear. Your move."],
];
```

---

## 8. How this doc is implemented (file roles)

- **This doc** — master spec. Edit here when Chad evolves.
- **Per-sport voice modules** (`shared/commentary/voice/basketballVoice.ts`; future `baseballVoice.ts`, `footballVoice.ts`) — operational copies of §1–3 + sport vocabulary/lore/examples, used as the culture-entry generator prompt. Each carries a one-line pointer to this doc.
- **`chadChallenge.ts`** — frame banks (§7 is the v1 applied to recipient intro + nudge). Implementation, not spec.
- **`selectCommentary.ts` + `libraries/*.json` + framing pools** — normal-commentary implementation.
- **`docs/h2h-reveal-arc-design.md`** — owns the H2H *surface* design only; carries a one-line pointer here for voice.

---

## 9. Backlog (not in v1)

- **F5 magnitude self-scaling** for recipient intro (plumbing — §5).
- **`opponentFlavor` wiring** — vetted matchup-keyed pool, inert on recipient intro and disabled in normal secondary. Highest-leverage personalization lever. Plumbing.
- **Nickname gate** — `isIconicNickname` 4-char minimum silently drops short nicknames (Bam → "Bam") project-wide. Audit at scale.
- **Normal-commentary "too short"** — lever is the `selectCommentary` composition modes + `isVeryShort` heuristic.
- **`baseballVoice.ts` / `footballVoice.ts`** — stubs; football has no culture DB yet.
- **Culture-entry weak-line scan** — targeted pass against §1–3; the only step needing re-vet sign-off.
- **Next frame surfaces** — trash talk, initiation, resolution, top-slot framing, rivalry-back, FTUE Chad.
