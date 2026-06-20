"""
ReplayIFS — Boss Generator PROTOTYPE (mechanism validation)
===========================================================
PURPOSE: prove the control flow before CC wires it to the real repo.
  - deterministic seeding (date + slot -> identical boss for everyone)
  - game-roll per starter, day-to-day variability (raid-boss restock)
  - difficulty band via DETERMINISTIC REJECTION SAMPLING in percentile space
  - tiered eligibility + boss-ability routing (in_band / handicap / raid)
  - identity-era scheduling weight (no era repeats too soon)
  - authored-feeling naming from the locked catch-phrase bank

!!! SYNTHETIC DATA !!!  Player names + catch-phrases are REAL (from the locked
story bank). The per-player FP numbers are GENERATED, not box scores. The real
generator (see CC brief) replaces the game_log() hook and the player-band hook
with the live computeRosterCeiling / runSimulator substrate and reruns.
"""

import hashlib
import random
import statistics
from dataclasses import dataclass
from datetime import date, timedelta

# ---------------------------------------------------------------------------
# Deterministic PRNG: same seed string -> same stream, everywhere.
# ---------------------------------------------------------------------------
def seeded_rng(*parts) -> random.Random:
    key = "|".join(str(p) for p in parts)
    h = hashlib.sha256(key.encode()).hexdigest()
    return random.Random(int(h[:16], 16))


# ---------------------------------------------------------------------------
# Boss data model. In the real generator, starters + their game logs come from
# most-games-started-per-position selection over the live box-score table.
# ---------------------------------------------------------------------------
@dataclass
class Starter:
    name: str
    pos: str
    fp_mean: float                       # SYNTHETIC central tendency

    def game_log(self, season_seed):
        """SYNTHETIC ~72-game FP pool, deterministic per (player, season)."""
        rng = seeded_rng("gamelog", season_seed, self.name)
        n = rng.randint(68, 78)
        std = self.fp_mean * 0.16
        return [max(0.0, rng.gauss(self.fp_mean, std)) for _ in range(n)]


@dataclass
class TeamSeason:
    key: str
    display: str          # authored name from the bank
    flavor: str
    era_id: str           # scheduling-weight unit (NOT team, NOT season)
    tier: str             # champ | iconic | false_neg
    starters: list

    @property
    def expected_total(self):
        return sum(s.fp_mean for s in self.starters)


# ---------------------------------------------------------------------------
# The bank (subset, 14 eras across the three tiers). Real names, synthetic FP.
# ---------------------------------------------------------------------------
BANK = [
    TeamSeason("CHI-1997", "Second Three-Peat", "Jordan's last Bulls core", "BULLS_2PEAT", "champ", [
        Starter("Michael Jordan","SG",78), Starter("Scottie Pippen","SF",58),
        Starter("Dennis Rodman","PF",32), Starter("Ron Harper","PG",42), Starter("Luc Longley","C",38)]),
    TeamSeason("SAS-2014", "The Beautiful Game", "the tic-tac passing clinic", "SPURS_BEAUTIFUL", "champ", [
        Starter("Tony Parker","PG",52), Starter("Danny Green","SG",42),
        Starter("Kawhi Leonard","SF",48), Starter("Tim Duncan","PF",56), Starter("Tiago Splitter","C",43)]),
    TeamSeason("GSW-2017", "The Death Lineup", "small-ball that broke the league", "GSW_KD", "champ", [
        Starter("Stephen Curry","PG",70), Starter("Klay Thompson","SG",56),
        Starter("Andre Iguodala","SF",46), Starter("Kevin Durant","PF",68), Starter("Draymond Green","C",52)]),
    TeamSeason("MIA-2013", "The Heatles", "66 wins, 27 straight", "HEATLES", "champ", [
        Starter("Mario Chalmers","PG",40), Starter("Dwyane Wade","SG",60),
        Starter("LeBron James","SF",78), Starter("Chris Bosh","PF",50), Starter("Ray Allen","C",40)]),
    TeamSeason("DET-2004", "Goin' to Work", "five starters, no stars, one ring", "PISTONS_WORK", "false_neg", [
        Starter("Chauncey Billups","PG",44), Starter("Richard Hamilton","SG",42),
        Starter("Tayshaun Prince","SF",36), Starter("Rasheed Wallace","PF",40), Starter("Ben Wallace","C",34)]),
    TeamSeason("MEM-2013", "Grit-n-Grind", "the floor was lava in Memphis", "GRIZZ_GRIND", "false_neg", [
        Starter("Mike Conley","PG",40), Starter("Tony Allen","SG",32),
        Starter("Tayshaun Prince","SF",33), Starter("Zach Randolph","PF",46), Starter("Marc Gasol","C",38)]),
    TeamSeason("LAL-2001", "Shaq-Kobe Three-Peat", "the most unguardable two-man game", "LAKERS_SHAQKOBE", "champ", [
        Starter("Derek Fisher","PG",40), Starter("Kobe Bryant","SG",66),
        Starter("Rick Fox","SF",40), Starter("Robert Horry","PF",36), Starter("Shaquille O'Neal","C",80)]),
    TeamSeason("DAL-2011", "Dirk's Title", "the fadeaway that wouldn't miss", "MAVS_DIRK", "champ", [
        Starter("Jason Kidd","PG",44), Starter("Jason Terry","SG",46),
        Starter("Shawn Marion","SF",46), Starter("Dirk Nowitzki","PF",60), Starter("Tyson Chandler","C",47)]),
    TeamSeason("BOS-2008", "The New Big Three", "Ubuntu", "CELTICS_BIG3", "champ", [
        Starter("Rajon Rondo","PG",45), Starter("Ray Allen","SG",48),
        Starter("Paul Pierce","SF",54), Starter("Kevin Garnett","PF",56), Starter("Kendrick Perkins","C",42)]),
    TeamSeason("DEN-2023", "Jokic's Crown", "the big man who sees everything", "NUGGETS_JOKIC", "champ", [
        Starter("Jamal Murray","PG",54), Starter("Kentavious Caldwell-Pope","SG",37),
        Starter("Michael Porter Jr.","SF",44), Starter("Aaron Gordon","PF",42), Starter("Nikola Jokic","C",72)]),
    TeamSeason("PHX-2007", "Seven Seconds or Less", "offense as performance art", "SUNS_SSOL", "iconic", [
        Starter("Steve Nash","PG",56), Starter("Raja Bell","SG",42),
        Starter("Shawn Marion","SF",56), Starter("Boris Diaw","PF",43), Starter("Amar'e Stoudemire","C",59)]),
    TeamSeason("MIL-2021", "Giannis", "the freak takes the crown", "BUCKS_GIANNIS", "champ", [
        Starter("Jrue Holiday","PG",48), Starter("Khris Middleton","SG",50),
        Starter("Giannis Antetokounmpo","SF",66), Starter("P.J. Tucker","PF",37), Starter("Brook Lopez","C",38)]),
    TeamSeason("GSW-2016", "73-9", "the best regular season ever", "GSW_73", "iconic", [
        Starter("Stephen Curry","PG",68), Starter("Klay Thompson","SG",54),
        Starter("Harrison Barnes","SF",40), Starter("Draymond Green","PF",50), Starter("Andrew Bogut","C",39)]),
    TeamSeason("CLE-2016", "The Comeback", "down 3-1, came back anyway", "CAVS_LBJ", "champ", [
        Starter("Kyrie Irving","PG",54), Starter("J.R. Smith","SG",38),
        Starter("LeBron James","SF",70), Starter("Kevin Love","PF",50), Starter("Tristan Thompson","C",38)]),
]

HEADLINE_TIERS = {"champ", "iconic"}   # false_neg routed to handicap, not headline


# ---------------------------------------------------------------------------
# Difficulty band: percentile window of the strong-capped player-lineup dist.
# Real generator pulls this distribution from runSimulator; here it's synthetic.
# ---------------------------------------------------------------------------
def player_band(p_lo=60, p_hi=85, n=6000):
    rng = seeded_rng("player_lineup_dist_v1")
    samples = sorted(rng.gauss(232, 24) for _ in range(n))
    q = statistics.quantiles(samples, n=100)
    return (q[p_lo - 1], q[p_hi - 1])


# ---------------------------------------------------------------------------
# Daily roll with deterministic rejection sampling.
#   - roll one game per starter (seeded by date+slot+team+attempt)
#   - if total out of band, advance the PRNG and re-roll the GAMES (not the team)
#   - after K misses, classify by expected total -> route (handicap / raid)
# ---------------------------------------------------------------------------
def roll_boss(ts, day, slot, band, K=8):
    logs = {s.name: s.game_log(ts.key) for s in ts.starters}
    last = None
    for attempt in range(K):
        rng = seeded_rng("roll", day.isoformat(), slot, ts.key, attempt)
        picks, total = [], 0.0
        for s in ts.starters:
            log = logs[s.name]
            i = rng.randrange(len(log))
            picks.append((s, i, log[i]))
            total += log[i]
        last = (picks, total, attempt)
        if band[0] <= total <= band[1]:
            return {"status": "in_band", "picks": picks, "total": total, "attempts": attempt + 1}
    side = "handicap" if ts.expected_total < band[0] else "raid"
    return {"status": side, "picks": last[0], "total": last[1], "attempts": K}


# ---------------------------------------------------------------------------
# Identity-era schedule: deterministic, weighted, no era within COOLDOWN days.
# ---------------------------------------------------------------------------
def schedule_headline(start, days, cooldown=5):
    pool = [ts for ts in BANK if ts.tier in HEADLINE_TIERS]
    out, recent = [], []
    for d in range(days):
        day = start + timedelta(days=d)
        rng = seeded_rng("sched", day.isoformat())
        eligible = [ts for ts in pool if ts.era_id not in recent]
        weights = [1.0 if ts.tier == "champ" else 0.6 for ts in eligible]
        pick = rng.choices(eligible, weights=weights, k=1)[0]
        out.append((day, pick))
        recent.append(pick.era_id)
        recent = recent[-cooldown:]
    return out


# ===========================================================================
def main():
    band = player_band(60, 85)
    print("=" * 74)
    print("ReplayIFS BOSS GENERATOR — prototype run  [SYNTHETIC DATA]")
    print("=" * 74)
    print(f"Difficulty band (P60-P85 of strong player-lineup dist): "
          f"[{band[0]:.0f}, {band[1]:.0f}] FP\n")

    # ---- Boss-ability routing for every team-season in the bank ----
    print("BOSS-ABILITY ROUTING  (curation proposes, band disposes)")
    print("-" * 74)
    print(f"{'team-season':<26}{'tier':<11}{'exp.FP':>7}   route")
    for ts in sorted(BANK, key=lambda t: -t.expected_total):
        exp = ts.expected_total
        if exp < band[0]:
            route = "HANDICAP  (false-neg: too low for a straight boss)"
        elif exp > band[1]:
            route = "RAID slot (elite: unbeatable-is-the-point)"
        else:
            route = "daily pool"
        print(f"{ts.display:<26}{ts.tier:<11}{exp:>7.0f}   {route}")

    # ---- 14-day headline schedule (era anti-repeat) ----
    start = date(2026, 6, 22)
    sched = schedule_headline(start, 14, cooldown=5)
    print("\n14-DAY HEADLINE SCHEDULE  (no identity-era within 5 days)")
    print("-" * 74)
    for day, ts in sched:
        print(f"  {day.isoformat()}  {ts.display:<26} [{ts.era_id}]")

    # verify the cooldown invariant
    eras = [ts.era_id for _, ts in sched]
    violations = [(i, e) for i, e in enumerate(eras)
                  if e in eras[max(0, i - 5):i]]
    print(f"\n  cooldown invariant (no repeat within 5d): "
          f"{'PASS' if not violations else f'FAIL {violations}'}")

    # ---- 10 sample daily bosses, full detail ----
    print("\n10 GENERATED DAILY BOSSES  (rolled, band-checked)")
    print("=" * 74)
    for day, ts in sched[:10]:
        res = roll_boss(ts, day, slot=0, band=band)
        tag = {"in_band": "OK", "handicap": "HANDICAP", "raid": "RAID"}[res["status"]]
        print(f"\n{day.isoformat()}  \"{ts.display}\"  —  {ts.flavor}")
        print(f"   total {res['total']:.0f} FP   | band [{band[0]:.0f},{band[1]:.0f}] "
              f"| {res['attempts']} roll(s) | {tag}")
        for s, gi, fp in res["picks"]:
            print(f"      {s.pos:<3} {s.name:<26} game #{gi:<2} -> {fp:5.1f} FP")

    print("\n" + "=" * 74)
    print("determinism check: re-running any date yields identical totals.")
    d0 = sched[0][0]
    a = roll_boss(sched[0][1], d0, 0, band)["total"]
    b = roll_boss(sched[0][1], d0, 0, band)["total"]
    print(f"  {d0} rerun: {a:.4f} == {b:.4f}  -> {'PASS' if a == b else 'FAIL'}")
    print("=" * 74)


if __name__ == "__main__":
    main()
