# Worktree registry

Single source of truth for the state of every git worktree under this project. Updated whenever a worktree changes state. Read at session-start as part of ritual item 5.

## How to use this doc

Each entry below describes one worktree: where it lives, what branch it carries, whether it has uncommitted work, what's unique on the branch vs main, and what the intent is. The header line of each entry names the **state**:

- **active** — current workhorse for some workstream
- **active-parked** — carries unique work that isn't on main; intend to resume
- **archive-candidate** — branch's unique commits have equivalent work landed on main via different SHAs (e.g. PR squash-merge); no committed work would be lost by archival
- **mergeable** — branch is fully merged-to-main; no unique commits; safe to delete branch (worktree may still be retained per other rules)
- **wip** — known throwaway scratch

When updating an entry, refresh:
- Unique-commit count: `git -C <path> log main..<branch> --oneline | wc -l`
- Uncommitted state: `git -C <path> status --short`
- Stash association: `git -C <path> stash list`
- Last reviewed date

### Critical: "unique commits" vs "unshipped work"

A branch can have N unique commits and still have **zero unique work** if those commits were re-landed on main via a different path (PR merge that squashes, cherry-pick with different SHA, etc.). To distinguish:

1. Pick one unique commit
2. Read its diff or commit message
3. Search main for an equivalent: `git log main --grep <distinctive-string>` or `git ls-tree main -- <files-it-touched>`
4. If equivalent found → archive-candidate
5. If no equivalent → active-parked or stale

This check matters more than the unique-commit count. SHA divergence ≠ work divergence.

---

## Registry

### `main` — active

- **Path:** `~/Desktop/ReplayMod`
- **Branch:** `main`
- **State:** active workhorse
- **Last reviewed:** 2026-05-23

---

### `feat/basketball-perseason-layout` — active-parked

- **Path:** `~/Desktop/ReplayMod-basketball`
- **Branch HEAD:** `8326295` (2026-05-09)
- **Unique commits vs main:** 23
- **Uncommitted state:**
  - `D basketball/src/adapters/__tests__/ftueRoster.verify.ts` (deleted locally; main has the cleanup commit at `a69c402`)
  - `M package-lock.json`
  - `?? basketball/public/headshots/`
  - `?? basketball/scripts/deleteSupabaseOrphans.mjs`
- **Stash:** `stash@{0}` — "football culture tier 1 WIP — May 2026, untouched since basketball ship". The stash is attached to this worktree, not main.
- **What it carries:** Per-season historical data extraction (1996-97 through 2024-25), season reel (slot-machine reveal at game entry), headshot fallback pipelines (Wikipedia, TheSportsDB, Supabase sync), per-season dataEngine wiring, FTUE/anchor fixes, season-aware slate cache. See `git log main..feat/basketball-perseason-layout --oneline` for the full list.
- **Equivalence on main:** Partial. Headshot-pipeline commits (`8c198a4` TheSportsDB fallback, `6b59b1e` Wikipedia fallback, `81e4eb3` syncHeadshotsToSupabase, `c32cc20` headshot pipeline correction, `5f08e8f` downloadHeadshots per-season walk, `9bf0261` orphan-headshot prune) have evolved equivalents on main — main carries the full headshot pipeline including `curatedHeadshots.mjs` (2K-sourced profile headshots per the script's self-documented provenance), `wikipediaHeadshotFallback.mjs`, `sportsdbHeadshotFallback.mjs`, `syncHeadshotsToSupabase.mjs`. **Not** on main: per-season historical data extraction at the granularity captured here, season-reel feature (slot-machine reveal at game entry), per-season dataEngine wiring, season-aware slate cache, season-aware FTUE behavior. The ~17 non-headshot commits are the genuinely-parked work.
- **Intent:** parked pending decision on whether the season-reel + per-season historical feature ships in current product scope.
- **Do-not-touch:** YES — preserve until resume/retire decision. Especially preserve the stash.
- **Last reviewed:** 2026-05-23
- **Next action:** when next touched, audit per-commit which are supersedence-on-main vs not-yet-shipped. Confirmed supersedence: the 6 headshot-pipeline commits listed above. Likely not-on-main: season-reel feature + per-season FTUE/dataEngine work. Rebase scope is smaller than the 23-commit raw count suggests. Decision frame: ship the season-reel feature (rebase + land), or archive via `archive/` prefix rename after committing or popping stash deliberately. 165 commits behind main on the parked side, so any rebase will not be small.

---

### `refactor/shared-card-face` — active-parked

- **Path:** `~/Desktop/ReplayMod-cardface`
- **Branch HEAD:** `9b18845` (2026-05-09 approx — "2 weeks ago" per log)
- **Unique commits vs main:** 2
  - `9b18845` refactor(shared): migrate baseball + football to shared CardFace
  - `c2177a0` refactor(shared): introduce CardFace/CardHero/CardBack shared card trio
- **Uncommitted state:** none verified (status not re-checked at registry write time; recheck on next visit)
- **What it carries:** CardFace / CardHero / CardBack shared component trio + migration of baseball and football wrappers to use them.
- **Equivalence on main:** **None.** Verified 2026-05-23: `shared/components/CardFace.tsx`, `CardHero.tsx`, `CardBack.tsx` do not exist on main. The refactor never landed.
- **Intent:** parked refactor. Card-face shared abstraction was started but didn't land. Sport wrappers on main still use their own card components.
- **Do-not-touch:** YES — preserve until resume/retire decision.
- **Last reviewed:** 2026-05-23
- **Next action:** decide if shared CardFace abstraction is still wanted. If yes, rebase + land. If no, archive via prefix rename.

---

### `fix/badge-label-match` — archive-candidate

- **Path:** `~/Desktop/ReplayMod-culture`
- **Branch HEAD:** `ae4a94f` (2026-05-12)
- **Unique commits vs main:** 3
  - `ae4a94f` fix(deploy): stale-chunk recovery + scoped Vercel rewrites
  - `56ed7d8` fix(ftue+slate): crisp anchor roll-up + tier trim on slate cards
  - `22a64c4` fix(commentary): badge labels reflect actual stat, not threshold
- **Uncommitted state:** CLAUDE.md is stale (predates the process-discipline preamble at `fb61852`); 104-line diff vs main on CLAUDE.md alone. Other files not re-checked.
- **What it carries:** Deploy stale-chunk recovery (`shared/lib/chunkReload.ts` + vercel.json rewrites + main.tsx wiring), FTUE/slate polish, commentary badge-label fix.
- **Equivalence on main:** **YES — work has shipped on main via different SHAs.** Verified 2026-05-23: `shared/lib/chunkReload.ts` exists on main (`b3376b4`); commit `5baacc4 fix(commentary): badge labels match actual stat, not threshold (#98)` on main is the PR-merge equivalent of `22a64c4`. The branch's commits aren't reachable from main but their content has been re-landed via PR.
- **Intent:** archive candidate. No work would be lost.
- **Do-not-touch:** Branch deletion is safe from a content-preservation standpoint, but defer until next intentional housekeeping session (don't bundle into bucket 2).
- **Last reviewed:** 2026-05-23
- **Next action:** rename to `archive/fix/badge-label-match` or delete branch entirely. Worktree can be removed (`git worktree remove`) since work is preserved on main.

---

### `worktree-feat+achievements-and-challenges` — mergeable (per handover, retain as safety net)

- **Path:** `~/Desktop/ReplayMod/.claude/worktrees/feat+achievements-and-challenges`
- **Branch HEAD:** `d810983` (advanced today from `34735d6` by the safekeeping commit)
- **Unique commits vs main:** 1 (the safekeeping commit `d810983` — preserves uncommitted scratch only; not for landing on main as-is)
- **Uncommitted state:**
  - `D basketball/src/adapters/__tests__/ftueRoster.verify.ts` (stale-index artifact — main has the cleanup commit `a69c402`)
  - `M package-lock.json` (stale-index artifact)
  - `?? basketball/public/headshots/` (stale-index — main shipped this in `a69c402`)
  - `?? basketball/scripts/deleteSupabaseOrphans.mjs` (stale-index — same)
- **What it carries:** Only the safekeeping commit. May 18 tier-2 culture-retry run output (review + failed JSON outputs), now committed at `d810983`. Targets file was already on main as part of `7eb6c07`.
- **Equivalence on main:** The safekeeping commit's content is NOT on main and intentionally not for landing. The review + failed JSONs are review artifacts; the file header reads "REVIEW each entry. Do NOT auto-merge into playerCulture.ts." Future culture session will review and merge selectively.
- **Intent:** Per existing handover rule: **DO NOT DELETE this worktree or its branch until challenge feature is fully shipped (all 3 buckets) AND verified working in production.** This rule is independent of the merge state — the worktree exists as a safety net.
- **Do-not-touch:** YES — per handover rule above.
- **Last reviewed:** 2026-05-23
- **Next action:** no further action until challenge feature is fully shipped, at which point worktree + branch can be retired and the safekeeping commit's content can be reviewed/integrated into playerCulture.ts via the future culture session.

---

### `feat/ch-debug-instrumentation` — active

- **Path:** `~/Desktop/ReplayMod/.claude/worktrees/feat+ch-debug-instrumentation`
- **Branch HEAD:** off `origin/main` (created 2026-06-02)
- **Unique commits vs main:** 1 (the instrumentation commit)
- **Uncommitted state:** none post-commit
- **What it carries:** Pure `[ch-debug]` instrumentation set for the ripe-challenge "drops to fresh deal" investigation. New file `shared/lib/chDebug.ts` (info-level, gated by `window.__CH_DEBUG__ !== false`), with call sites in `basketball/src/App.tsx`, `shared/components/H2HRecipientPlay.tsx`, `shared/components/ErrorBoundary.tsx`, `shared/lib/chunkReload.ts`, `shared/components/ChallengeLandingScreen.tsx`, `shared/hooks/useChallengeAttempt.ts`. Zero logic changes — logging only.
- **Equivalence on main:** None — new branch, intentional.
- **Intent:** land quickly to capture the path that fires on the next ripe-challenge bug repro; the helper is single-file so removal = revert one commit.
- **Do-not-touch:** no — short-lived, merge once instrumentation has captured the bug.
- **Last reviewed:** 2026-06-02
- **Next action:** merge to main; after the bug is captured + fixed elsewhere, revert this commit.

---

## Worktree naming conventions

Proposal locked 2026-05-23. Applies to future branches; existing branches will be renamed lazily when next touched.

| Prefix | Meaning |
|---|---|
| `feat/`, `fix/`, `refactor/`, `chore/`, `data/`, `culture/` | Active workstream — currently being worked on |
| `parked/` (overrides above) | Parked workstream — has unique unshipped commits, intend to resume |
| `archive/` (overrides above) | Archived — work preserved elsewhere or abandoned; branch retained for history |
| `wip/` | Known throwaway scratch — disposable |

Renaming is cheap (`git branch -m old new` + force-push). When in doubt, leave the active-style prefix and just update this registry's state line.

---

## Marker convention for precious uncommitted files

For files inside a worktree that absolutely cannot be lost, the preferred primitive is **commit them on the parked branch**. Branches are the right tool for "preserve this work without merging it." A commit subject like `wip: <thing> — review pending, do not auto-merge` is itself a permanent marker.

If commit isn't appropriate (e.g. a generated file you regenerate each run), a `_DO-NOT-DELETE.md` marker file at the worktree root listing what's preserved and why is an acceptable secondary primitive.

Untracked files with no marker and no commit are **at risk**. The registry exists to surface them so they can be either committed or marked.

### `fix-h2h-commentary` — mergeable

- **Path:** `~/Desktop/ReplayMod/.claude/worktrees/fix-h2h-commentary`
- **Branch:** `fix/h2h-commentary`
- **Unique commits vs main:** 0 (ff-merged — same SHA on both)
- **Uncommitted state:** clean
- **Stash:** none (the `stash@{0}` football-culture WIP visible from `stash list` belongs to `feat/basketball-perseason-layout`, not this worktree)
- **What it carries:** H2H static recipient-copy pass — killed dynamic per-draw commentary on H2HRecipientPlay (stage-1 instruction, stage-2 directive, redraw-beat number persistence).
- **Equivalence on main:** VERIFIED — `2592555` is on main directly via fast-forward (same SHA, not squash); pushed to origin 2026-06-08, Vercel green.
- **Intent:** safe to delete branch; worktree retained pending the queued 38-worktree audit (do NOT remove ad-hoc).
- **Last reviewed:** 2026-06-08

- `fix/rd2-strip-shrink` glass-confirmed @ `fa73455` 2026-06-09 — RD2 unify-lock (one 80px mini-slot across hold/draw → play → reveal → results, results-referenced); overlap deferred to RD2.1. Pushed to `origin/fix/rd2-strip-shrink`; no PR, no merge.
