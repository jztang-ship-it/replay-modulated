# Handover — football portrait morning session

> **Read this first.** Picks up from the 2026-05-07 night session that shipped slate v2 to all three sports and pushed the football portrait pipeline.
> Last updated: 2026-05-07 (night).

## TL;DR

- **Slate v2 is fully shipped** to basketball, baseball, and football on `origin/main`. All flag-gated OFF by default (`VITE_FEATURE_SLATE_V2_<SPORT>`). Nothing pending.
- **PR #57 is open** with the football portrait pipeline rewrite — per-player processing modes + damage detector + resolver fallback chain. Branch: `fix/football-portrait-consistency`. Branched from current `main`, no rebase needed.
- **Morning task:** review/merge PR #57, then chase any remaining football portrait issues surfaced in deploy preview.

## Slate v2 — shipped state

| Sport | Slate panel | Adapter wired | Flag |
|---|---|---|---|
| Basketball | `basketball/src/components/BasketballSlatePanel.tsx` | ✓ | `VITE_FEATURE_SLATE_V2_BASKETBALL` |
| Baseball | `baseball/src/components/BaseballSlatePanel.tsx` | ✓ | `VITE_FEATURE_SLATE_V2_BASEBALL` |
| Football | `football/src/components/FootballSlatePanel.tsx` | ✓ | `VITE_FEATURE_SLATE_V2_FOOTBALL` |

Football slate landed via PRs #50/#53 (the football SPA bulldoze + polish PRs) so all three are unified architecturally — all share `shared/components/TodaysSlatePanel.tsx` + `shared/hooks/useDailySlate.ts`.

**Pre-beta safety:** with flag OFF the deal path is byte-equivalent to current production. Verified across all three sports.

**Calibration runbook:** `docs/superpowers/plans/2026-05-05-slate-v2.md` and the `--slate-v2` flag on `runSimulator`. Required gate before flipping any sport's flag in Vercel.

## PR #57 — football portrait pipeline

URL: https://github.com/jztang-ship-it/replay-modulated/pull/57
Branch: `fix/football-portrait-consistency` (worktree at `/Users/john/Desktop/ReplayMod-football-portrait`)
Tip: `06647d1`

### What changed

Two passes on top of PR #55 ("blend headshots into cards"):

1. **Pass 1** (`3be7789` → `8910505`): flood-fill BG removal that kills the white box, preserves face, fixes a striping artifact, tightens the threshold so colored jerseys aren't cut.
2. **Pass 2** (`308a5f5` → `06647d1`): portrait composition matched to basketball, then per-player processing modes after a full reprocess regressed Lemar/Messi/Moreno.

### Per-player processing modes

`football/scripts/playerProcessingOverrides.mjs` — default is `whiteStudio`, override per ID:

| Mode | Predicate | Use case |
|---|---|---|
| `whiteStudio` | RGB ≥ 215 OR (max ≥ 225 AND sat < 20), edge-only flood (1px inset) | Standard white studio |
| `whiteStudio + preserveJersey` | Tighter (RGB ≥ 230, sat < 10) | Players in white kits (Messi, Mbappé) |
| `grayStudio` | sat < 35 AND (bright > 120 OR near-neutral), 3px inset seeds | Martinez (gray backdrop) |
| `darkStudio` | sat < 35 AND max < 100, 3px inset, edge-connected | Reserved (no current users) |
| `skipUseOriginal` / `manualBadCutout` | No processing; deletes existing PNG | Lemar, Moreno |

### Damage detector

Every output checked against alpha mask:
- Total transparent > 75% → reject (`too-transparent`)
- Center 40% face-zone > 30% transparent → reject (`face-eaten`)

Last batch: 0 rejections.

### Resolver behavior (`shared/media/playerImages.ts`)

Reads `_quality.json` sidecar at module load:
- `cleanCutout` → `players-processed/<id>.png`
- `badCutout` / `skipUseOriginal` → falls through to raw `players/<id>.png`
- `manualBadCutout` → returns null → caller renders flag + initials portrait tile

### Per-player results (latest reprocess)

| ID | Player | Mode | Result |
|---|---|---|---|
| 6909 | Martinez | grayStudio | ✅ gray backdrop removed |
| 5503 | Messi | whiteStudio + preserveJersey | ✅ face/jersey intact (2.86% face) |
| 3009 | Mbappé | whiteStudio + preserveJersey | ✅ face intact (1.47%); ~60 white kit pixels retained |
| 30714 | Bellingham | whiteStudio | ✅ clean (0.97% face) |
| 3245 | Lemar | manualBadCutout | PNG deleted → portrait tile |
| 5573 | Moreno | manualBadCutout | PNG deleted → portrait tile |

Other 32 players default `whiteStudio`.

### CLI

```bash
# Process selected ids only
node football/scripts/processPlayerHeadshots.mjs --ids 6909,5503,3009

# Audit selected ids (transparency %, face zone, holes)
node football/scripts/processPlayerHeadshots.mjs --audit --ids 6909

# Add a new override: edit football/scripts/playerProcessingOverrides.mjs
# Then re-run with --ids <newId>
```

## Known issues to watch

- **Player 16531** — 12.94% face-zone transparency, highest under the 30% threshold. If it visibly degrades in the deploy preview, move to `manualBadCutout`.
- **Mbappé (3009)** — ~60 white kit pixels retained vs Martinez's 0. Acceptable on orange tier; full fix would need ML segmentation.
- **Moreno (5573)** — source is a stadium photo, no algorithm cuts it cleanly. Portrait tile fallback is correct; consider sourcing a better image later.
- **Pre-existing test failures (8) and TS errors** — unrelated to this work, pre-date the football portrait pass.

## Repo state — worktrees and stale refs

Active worktrees (`git worktree list`):

```
/Users/john/Desktop/ReplayMod                    8910505 [fix/football-flood-fill-bg-removal]
/Users/john/Desktop/ReplayMod-football-portrait  06647d1 [fix/football-portrait-consistency]
/Users/john/Desktop/ReplayMod-slate-v2           ffbba1b [feature/slate-v2]
```

**Cleanup pending (zero risk, do whenever):**

1. `origin/feature/slate-v2` — stale. Slate is fully merged; this branch is at the old `0530a59`. Delete from origin.
2. Tag `slate-v2-pre-rebase` — safety tag from the slate rebase. Delete locally + on origin.
3. `/Users/john/Desktop/ReplayMod-slate-v2` worktree — slate work is fully merged. `git worktree remove` it.
4. `fix/football-flood-fill-bg-removal` (the main checkout's branch) — superseded by `fix/football-portrait-consistency`. Local branch can be deleted after PR #57 merges.

## Parallel-terminal context

The other terminal (the football team's session) often runs with `dangerously-skip-permissions`. If you start non-trivial work, default to a worktree — see `~/.claude/projects/-Users-john-Desktop-ReplayMod/memory/feedback_parallel_terminals_use_worktree.md`. The `ReplayMod-football-portrait` worktree was created exactly for this reason.

## Suggested morning order

1. Open PR #57 in deploy preview, walk the football slate panel + in-game cards.
2. Confirm acceptance criteria visually:
   - Lemar/Moreno render as flag-initials tiles (no broken processed PNG used)
   - Messi/Mbappé faces and kits intact
   - Martinez gray backdrop is gone
   - Basketball/baseball untouched
3. If any new bad portrait surfaces, add the ID to `playerProcessingOverrides.mjs` with the right mode and re-run `--ids <id>`.
4. Merge PR #57.
5. Cleanup pass on stale refs + worktree.
