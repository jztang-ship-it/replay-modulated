/**
 * templateBank.basketball.ts — Basketball templates keyed by (register, story, tone).
 * Each entry has 3-6 alternatives with varied sentence structure and name forms.
 * Tokens: {name} {last} {first} {nick} {nick2} {pts} {reb} {ast} {opp} {badge} {streak} {gap} {record} {recordHolder} {recordValue}
 */

import type { CommentaryTemplate } from "./types";

export const BASKETBALL_TEMPLATES: CommentaryTemplate[] = [

  // ═══ WIN — star_went_off ═══════════════════════════════════════════════════

  { register: "win", story: "star_went_off", tone: "hype", templates: [
    "{name} dropped {pts}{opp} and this hand absolutely cashed. That's a night.",
    "{pts} points. That was all {last}. Statement game.",
    "Nobody was stopping {nick} tonight — {pts} and counting.",
    "{last} went off{opp}. {pts} points and the roster rode the wave.",
    "That's {nick} at full power. {pts}{opp}. Take your money.",
  ]},
  { register: "win", story: "star_went_off", tone: "warm", templates: [
    "Good night to have {name} on your roster. {pts} points, clean and efficient.",
    "{pts}{opp}. That's {last} doing exactly what you paid for.",
    "The roster had a guy tonight. {name} set the tone and never let up.",
    "{first} came through big. {pts} points and the whole roster benefited.",
  ]},
  { register: "win", story: "star_went_off", tone: "culture_wry", templates: [
    "{last} put up {pts}{opp} and honestly, someone should check on the opposing defense.",
    "{nick} decided to remind everyone tonight. {pts} points. Message received.",
    "Someone had to go for {pts}. {first} decided it was him.",
    "{pts} from {nick}{opp}. At this point it's just showing off.",
    "{name} treated this one like a personal vendetta. {pts} points of evidence.",
  ]},
  { register: "win", story: "star_went_off", tone: "observational", templates: [
    "{name} went for {pts}{opp}. The kind of performance that carries a hand.",
    "{pts} from {last} tonight. When the star delivers, everything else falls in place.",
    "{nick} was the story. {pts} points and the hand followed.",
  ]},
  { register: "win", story: "star_went_off", tone: "analytical", templates: [
    "{name} came in well above projection{opp}. {pts} points — that's the upside you pay for.",
    "{last} exceeded average by a wide margin tonight. The hand reflects it.",
    "The anchor outperformed. {pts} from {name}. That's how you build a winning hand.",
  ]},
  { register: "win", story: "star_went_off", tone: "deadpan", templates: [
    "{last} went for {pts}. Won. On to the next one.",
    "{pts} from {nick}. That'll do.",
    "{name} handled it. {pts}{opp}. Done.",
  ]},

  // ═══ WIN — star_delivered ══════════════════════════════════════════════════

  { register: "win", story: "star_delivered", tone: "hype", templates: [
    "{name} showed up when it mattered{opp}. That's what stars do.",
    "{last} brought it tonight. Not his biggest night, but enough to cash.",
    "{nick} delivered. The roster followed. Good hand.",
  ]},
  { register: "win", story: "star_delivered", tone: "warm", templates: [
    "Solid night from {name}. Did the job, the roster held up. Take the win.",
    "{last} was steady all night{opp}. No fireworks, just a good result.",
    "Professional performance from {first}. The kind of hand that adds up over time.",
  ]},
  { register: "win", story: "star_delivered", tone: "culture_wry", templates: [
    "{nick} didn't break a sweat and still cashed. Must be nice.",
    "{last} on cruise control is still better than most players trying hard.",
    "Average {nick} night. The rest of us wish our average looked like that.",
  ]},
  { register: "win", story: "star_delivered", tone: "observational", templates: [
    "{name} came in around projection{opp}. Consistent and the hand benefited.",
    "{last} did what was expected. The roster did the rest.",
  ]},
  { register: "win", story: "star_delivered", tone: "analytical", templates: [
    "{name} tracked close to average tonight. Consistent anchor play got the win.",
    "The star hit projection. The supporting cast stayed in range. Clean hand.",
  ]},
  { register: "win", story: "star_delivered", tone: "deadpan", templates: [
    "{last} did his job. Won. Move on.",
    "{nick} was fine. The hand was fine. Next.",
  ]},

  // ═══ WIN — star_quiet_win ═════════════════════════════════════════════════

  { register: "win", story: "star_quiet_win", tone: "hype", templates: [
    "The roster found a way without {name} going off. Team effort and it paid.",
    "Quiet night from {nick} but the hand still cashed. The supporting cast stepped up.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "warm", templates: [
    "{name} had a quiet one, but the roster held it together. A win is a win.",
    "Not {last}'s best night, but the hand survived. Take the money.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "culture_wry", templates: [
    "{nick} took the night off and the roster covered for it. Teamwork makes the dream work.",
    "Even on a quiet night, {last}'s floor is someone else's ceiling.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "observational", templates: [
    "{name} came in below average but the roster compensated. Balanced hand.",
    "Quiet from {last}{opp}. The bench made up the difference.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "analytical", templates: [
    "{name} underperformed projection but roster depth covered the gap.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "deadpan", templates: [
    "{last} was quiet. Still won. Doesn't matter how.",
  ]},

  // ═══ WIN — clean_win (no nameable star) ═══════════════════════════════════

  { register: "win", story: "clean_win", tone: "hype", templates: [
    "The roster came together tonight. No one player, just a solid collective effort.",
    "Everybody contributed. That's how you cash a hand.",
  ]},
  { register: "win", story: "clean_win", tone: "warm", templates: [
    "Good hand. The roster did its job across the board.",
    "No hero ball needed. The group effort got it done.",
  ]},
  { register: "win", story: "clean_win", tone: "culture_wry", templates: [
    "Nobody went nuclear but everybody showed up. The committee approach worked.",
    "Win by committee. Not sexy, but the money spends the same.",
  ]},
  { register: "win", story: "clean_win", tone: "observational", templates: [
    "Balanced output across the roster. No standout, just consistent play.",
  ]},
  { register: "win", story: "clean_win", tone: "analytical", templates: [
    "Contributions were spread evenly. No single driver — depth won this hand.",
  ]},
  { register: "win", story: "clean_win", tone: "deadpan", templates: [
    "Won. Nobody did anything special. On to the next.",
  ]},

  // ═══ LOSS — star_no_showed ════════════════════════════════════════════════

  { register: "loss", story: "star_no_showed", tone: "deadpan", templates: [
    "{last} came in way below the line. Not much else to say about this one.",
    "Needed {nick} to show up. Didn't happen.",
    "{name} was a no-show{opp}. That's the whole story.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "warm", templates: [
    "Tough one. {name} had an off night and the roster couldn't make up for it.",
    "{first} didn't have it tonight. Happens to everyone. Next hand.",
    "Off night from {last}{opp}. The supporting cast tried but it wasn't enough.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "culture_wry", templates: [
    "{nick} picked tonight to take a personal day. The roster noticed.",
    "{last} had more turnovers than highlights and that's genuinely hard to do.",
    "Way below his usual night. {name} owes the supporting cast an apology.",
    "{first} went ghost{opp}. The box score is evidence.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "observational", templates: [
    "{name} came in well below average{opp}. Hard to overcome that.",
    "{last} was the difference tonight — and not the good kind.",
    "The anchor underperformed significantly. {name} was the gap.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "analytical", templates: [
    "{name} came in far below projection. At that salary, the hand needed more.",
    "{last}'s output was insufficient to sustain the hand. The math wasn't there.",
  ]},

  // ═══ LOSS — star_cold ═════════════════════════════════════════════════════

  { register: "loss", story: "star_cold", tone: "deadpan", templates: [
    "{last} was cold. The hand followed. That's how it goes.",
    "Not {nick}'s night. Happens.",
  ]},
  { register: "loss", story: "star_cold", tone: "warm", templates: [
    "{name} had a rough one{opp}. One of those nights.",
    "Below the line from {last}. The roster didn't have enough to cover it.",
  ]},
  { register: "loss", story: "star_cold", tone: "culture_wry", templates: [
    "{nick} played like someone told him the game started at a different time.",
    "{last} was off and everybody else was just okay. Recipe for a bust.",
  ]},
  { register: "loss", story: "star_cold", tone: "observational", templates: [
    "{name} came in below average{opp}. The margin for error was thin and it showed.",
  ]},
  { register: "loss", story: "star_cold", tone: "analytical", templates: [
    "{name} tracked below projection tonight. Insufficient margin from the supporting cast.",
  ]},

  // ═══ LOSS — everyone_flat ═════════════════════════════════════════════════

  { register: "loss", story: "everyone_flat", tone: "deadpan", templates: [
    "Nobody had it tonight. Sometimes the cards don't come in.",
    "Flat across the board. Not one card pulled its weight.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "warm", templates: [
    "Tough night all around. Nobody could get anything going.",
    "The whole roster had an off night. Take the L and move on.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "culture_wry", templates: [
    "The entire roster collectively decided to take the night off.",
    "If this hand was a group project, nobody did their part.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "observational", templates: [
    "No single culprit. Every card came in below the line.",
    "The roster underperformed across the board. Collective miss.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "analytical", templates: [
    "Every card tracked below projection. No individual cause — systemic underperformance.",
  ]},
];
