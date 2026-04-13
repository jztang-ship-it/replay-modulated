/**
 * templateBank.baseball.ts — Baseball templates keyed by (register, story, tone).
 * Uses baseball-specific language: at-bats, on the mound, yard, K's, etc.
 */

import type { CommentaryTemplate } from "./types";

export const BASEBALL_TEMPLATES: CommentaryTemplate[] = [

  // ═══ WIN — star_went_off ═══════════════════════════════════════════════════

  { register: "win", story: "star_went_off", tone: "hype", templates: [
    "{name} had a monster day at the plate{opp}. The kind of game that carries an entire lineup to a win.",
    "{last} crushed it today. Multi-hit game with power and the hand cashed because of it.",
    "Nobody was getting {nick} out today{opp}. Absolute clinic at the plate and the hand rode the wave.",
    "{nick} owned the yard today{opp}. When the bat is that hot, the hand takes care of itself.",
    "That is {name} at full power. Raked all day{opp} and the lineup followed right behind the star.",
  ]},
  { register: "win", story: "star_went_off", tone: "warm", templates: [
    "Great day to have {name} in the lineup{opp}. Came through in every at-bat that mattered today.",
    "{last} set the tone early and never let up. Clean swings, big results, comfortable win for the hand.",
    "The lineup had a guy today. {name} put the team on the back{opp} and carried it all the way home.",
    "{first} came through big today. Every at-bat felt dangerous and the final line proved it.",
  ]},
  { register: "win", story: "star_went_off", tone: "culture_wry", templates: [
    "{last} treated the opposing pitching staff like batting practice today{opp}. Someone file a complaint.",
    "{nick} decided to remind everyone what the scouting report warned about. Message delivered today.",
    "Someone had to go off today. {first} decided it was going to be that kind of afternoon{opp}.",
    "{name} had the kind of day that makes opposing managers start making phone calls to the bullpen early.",
    "The pitcher had a family, {nick}. No mercy at the plate today and the box score is evidence.",
  ]},
  { register: "win", story: "star_went_off", tone: "observational", templates: [
    "{name} came through big{opp}. The kind of day from the top of the lineup that makes everything work.",
    "{last} was locked in from the first pitch today. When the star produces like that, the hand follows.",
    "The numbers tell the story: {name} dominated{opp} and the hand cashed because of that performance.",
  ]},
  { register: "win", story: "star_went_off", tone: "analytical", templates: [
    "{name} came in well above the expected line{opp}. That kind of output is why you pay the salary.",
    "{last} exceeded average output by a wide margin today. The winning hand is the direct result of it.",
    "Above-average production from {nick} today{opp}. The math worked and the hand cashed.",
  ]},
  { register: "win", story: "star_went_off", tone: "deadpan", templates: [
    "{last} went off{opp}. Won the hand. On to the next one in the schedule.",
    "{nick} handled business today{opp}. Cash it and move on.",
    "Big day from {last}. Hand won. Not complicated.",
  ]},

  // ═══ WIN — star_delivered ══════════════════════════════════════════════════

  { register: "win", story: "star_delivered", tone: "hype", templates: [
    "{name} showed up today{opp}. Did the job and the lineup followed. Good hand all around.",
    "{last} brought it today. Professional at-bats and the hand cashed because of it.",
    "Solid day from {nick}. The lineup clicked{opp} and the result is in the books.",
    "Good hand across the board. Everyone did their part and the result speaks for itself today.",
    "Lineup clicked today. No drama, no heroics needed. Just a clean hand that cashed.",
  ]},
  { register: "win", story: "star_delivered", tone: "warm", templates: [
    "Solid day from {name}{opp}. Did the job, the lineup held up. Take the win and keep going.",
    "{last} was steady all game{opp}. No fireworks needed, just a good result for the hand.",
    "Professional performance from {first}. The kind of hand that quietly adds up over time.",
    "The kind of hand you want every time. Steady across the board, money in the account.",
    "Clean win today. Everyone contributed, nobody had to carry. That is the blueprint.",
  ]},
  { register: "win", story: "star_delivered", tone: "culture_wry", templates: [
    "{nick} did not break a sweat and still cashed the hand. Must be nice to have that consistency.",
    "{last} on autopilot is still better than most hitters going full effort at the dish.",
    "Just another day at the park for {last}{opp}. Showed up, produced, collected the win quietly.",
    "Boring win. Best kind of win. The lineup handled business without anyone needing to be a hero.",
    "The handbook says this is how you are supposed to win. Nobody told the lineup it would be this easy.",
  ]},
  { register: "win", story: "star_delivered", tone: "observational", templates: [
    "{name} came in around the expected line{opp}. Consistent output and the hand benefited.",
    "{last} did what was expected today. The rest of the lineup handled the margins.",
    "Balanced contributions across the lineup today. Nobody carried, nobody dropped. Solid result.",
    "The lineup did what it was built to do today. No single card had to do too much.",
  ]},
  { register: "win", story: "star_delivered", tone: "analytical", templates: [
    "{name} tracked close to average today{opp}. Consistent anchor play got the win.",
    "The star hit the expected line. The supporting cast stayed in range. Clean hand overall.",
    "The lineup tracked within expected ranges across the board. Consistent inputs, consistent output.",
  ]},
  { register: "win", story: "star_delivered", tone: "deadpan", templates: [
    "{last} did the job today{opp}. Won the hand. Moving on to the next one.",
    "Standard day from {last}. Standard result. Nothing to overthink here.",
    "Won. Nothing interesting happened. Cash it and move on.",
    "Another one in the win column. Not much to talk about. Not much needs to be said.",
  ]},

  // ═══ WIN — star_quiet_win ═════════════════════════════════════════════════

  { register: "win", story: "star_quiet_win", tone: "hype", templates: [
    "The lineup found a way without {name} going off. Team effort and it paid off today.",
    "Quiet day from {nick} but the hand still cashed. The supporting bats stepped up big.",
    "The bench showed out today. Quiet hand from the top but the depth came through.",
    "Won it on depth alone. Sometimes the supporting cast writes the story.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "warm", templates: [
    "{name} had a quiet one, but the lineup held it together. A win is a win in this game.",
    "Not {last}'s best day, but the hand survived and cashed. Take the money and keep going.",
    "Quiet day from the top of the lineup but the depth held. Sometimes that is all you need.",
    "The supporting cast picked up the slack today. Not every win comes from the star.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "culture_wry", templates: [
    "{nick} took the day off and the lineup covered for it. Teamwork makes the dream work.",
    "Even on a quiet day, {last}'s floor is someone else's ceiling. The hand survived fine.",
    "Won it without the star going off. The bench has been waiting for this moment all season.",
    "The bench said we got this today. And honestly, they were not wrong about it.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "observational", templates: [
    "{name} came in below average but the lineup compensated. Balanced hand overall.",
    "The hand won despite the star running cold. Depth across the lineup made the difference.",
    "Not a star-driven win. The supporting bats filled in across the board and the hand survived.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "analytical", templates: [
    "{name} fell short of the expected line today but lineup depth covered the gap. Solid build.",
    "Star output was down but the supporting cards compensated. The math still worked for a win.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "deadpan", templates: [
    "{last} was quiet today{opp}. Still won. Does not matter how you get there.",
    "Won. The star was quiet. The bench was not. Sometimes that is the formula.",
    "Not the prettiest win. Still a win. Take it and move on.",
  ]},

  // ═══ WIN — clean_win ══════════════════════════════════════════════════════

  { register: "win", story: "clean_win", tone: "hype", templates: [
    "The whole lineup came together today. Cash the hand and feel good about the roster build.",
    "Everybody contributed. That is how you win a hand without needing a hero to carry it.",
    "Full lineup effort across the board. Collective energy and a collective win.",
  ]},
  { register: "win", story: "clean_win", tone: "warm", templates: [
    "Good hand. The lineup did the job across the board without any drama today.",
    "No hero ball needed. The group effort got it done. Comfortable day.",
    "The whole lineup contributed. Balanced production and a comfortable win.",
  ]},
  { register: "win", story: "clean_win", tone: "culture_wry", templates: [
    "Nobody went yard but everybody got on base. The committee approach actually worked today.",
    "Win by committee. Not flashy, but the money spends the same in the end.",
    "The lineup just quietly handled business today. No drama, no problems, just a clean win.",
  ]},
  { register: "win", story: "clean_win", tone: "observational", templates: [
    "Balanced output across the lineup. No standout, just consistent production top to bottom.",
    "No single card drove the result. The lineup each did their part for a collective win.",
  ]},
  { register: "win", story: "clean_win", tone: "analytical", templates: [
    "Contributions were spread evenly across the lineup. Depth and balance won this hand today.",
    "When everyone hits their marks, the hand takes care of itself. That is what happened here.",
  ]},
  { register: "win", story: "clean_win", tone: "deadpan", templates: [
    "Won the hand. Nobody stood out. Nobody needed to. On to the next one.",
    "Committee win. Not exciting but it counts the same on the ledger.",
  ]},

  // ═══ LOSS — star_no_showed ════════════════════════════════════════════════

  { register: "loss", story: "star_no_showed", tone: "deadpan", templates: [
    "{last} came in way below the line today{opp}. Not much else to say about this one.",
    "Needed {nick} to produce today and it did not happen. The hand paid the price.",
    "{name} was a no-show{opp}. That is the whole story of this hand right there.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "warm", templates: [
    "Tough one. {name} had an off day{opp} and the lineup could not make up for it.",
    "{last} did not have it today. Happens to everyone. Shake it off and play the next hand.",
    "Off day from {last}{opp}. The supporting bats tried but it was not enough to survive.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "culture_wry", templates: [
    "{nick} picked today to take a personal day and the lineup noticed the absence immediately.",
    "Way below the usual day from {name}. The supporting cast deserves an apology after this one.",
    "{last} went cold at the plate{opp}. The box score does not paint a pretty picture today.",
    "Someone should check on {nick} after that one. The stat line suggests a case of mistaken identity.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "observational", templates: [
    "{name} came in well below average{opp}. Hard to overcome that kind of deficit from the top card.",
    "{last} was the difference today — and not the good kind of difference you want from your star.",
    "The anchor fell way short today. {name}{opp} was the gap the lineup could not close.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "analytical", templates: [
    "{name} came in far below the expected line{opp}. At that salary, the hand needed more output.",
    "{last}'s output was insufficient to sustain the hand today. The math was not there for a win.",
    "Way below the line from {nick}{opp}. The deficit at the anchor spot sank the entire hand.",
  ]},

  // ═══ LOSS — star_cold ═════════════════════════════════════════════════════

  { register: "loss", story: "star_cold", tone: "deadpan", templates: [
    "{last} was cold today{opp}. The hand followed that direction. That is how it goes sometimes.",
    "Not {nick}'s day. It happens to everyone. Shake it off and come back for the next one.",
    "Below the line from {last}. Not enough from the lineup to cover the shortfall.",
  ]},
  { register: "loss", story: "star_cold", tone: "warm", templates: [
    "{name} had a rough one today{opp}. One of those days you just want to forget.",
    "Cold day from {last}{opp}. The supporting bats fought but the gap was too wide.",
    "{nick} was not at the usual level today{opp}. It happens. Move on and reset.",
  ]},
  { register: "loss", story: "star_cold", tone: "culture_wry", templates: [
    "{nick} swung at everything and hit nothing today. Not the approach the scouting report recommended.",
    "{last} was off and everybody else was just okay. Recipe for a bust every single time.",
    "Somewhere out there is the version of {nick} who rakes. Today was not that version.",
  ]},
  { register: "loss", story: "star_cold", tone: "observational", templates: [
    "{name} came in below average{opp}. The margin for error was thin and it showed in the result.",
    "Below the expected line from {last}{opp}. When the star is cold, the hand rarely survives.",
  ]},
  { register: "loss", story: "star_cold", tone: "analytical", templates: [
    "{name} tracked below the expected line today{opp}. The margin from the supporting lineup was not enough.",
    "Below-average output from {last} today. The hand needed more from the anchor spot to stay alive.",
  ]},

  // ═══ LOSS — everyone_flat ═════════════════════════════════════════════════

  { register: "loss", story: "everyone_flat", tone: "deadpan", templates: [
    "Nobody had it today. Sometimes the lineup just does not come through. On to the next one.",
    "Flat across the board. Not one card in the lineup pulled its weight today.",
    "The whole lineup came in below the line. Nothing worked. On to the next hand.",
    "{last} and the rest of the lineup all came in cold. Nothing worked today.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "warm", templates: [
    "Tough day all around. Nobody could get anything going at the plate or on the mound.",
    "The whole lineup had an off day. Take the loss and move on. Fresh start next hand.",
    "One of those collective off days that just happen. Nobody is to blame. Reset and come back.",
    "Not the day anyone wanted. The whole lineup was cold. Next hand is a clean slate.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "culture_wry", templates: [
    "The entire lineup collectively decided to take the day off. At least they committed to it.",
    "If this hand was a group project, nobody did their part. Unified in their mediocrity today.",
    "Everyone forgot to show up today. At least they were all consistent about that one thing.",
    "The lineup phoned it in today. A team effort in the wrong direction. Very on brand.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "observational", templates: [
    "No single culprit today. Every card came in below the line across the board. Collective miss.",
    "The lineup fell short across the board. A collective miss from top to bottom.",
    "Broad struggles left no margin for the hand at all. Nobody stepped up when needed.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "analytical", templates: [
    "Every card tracked below the expected line. No individual cause — systemic collective miss.",
    "The lineup all came in under their expected outputs today. The broad miss sank the hand.",
    "Below the line across the board. When everyone misses, the hand has no chance.",
  ]},
];
