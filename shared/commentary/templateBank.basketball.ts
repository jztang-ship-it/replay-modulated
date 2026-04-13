/**
 * templateBank.basketball.ts — Basketball templates keyed by (register, story, tone).
 * Each entry has 4-6 alternatives with varied sentence structure and name forms.
 * Tokens: {name} {last} {first} {nick} {nick2} {pts} {reb} {ast} {opp} {badge} {streak} {gap} {record} {recordHolder} {recordValue}
 */

import type { CommentaryTemplate } from "./types";

export const BASKETBALL_TEMPLATES: CommentaryTemplate[] = [

  // ═══ WIN — star_went_off ═══════════════════════════════════════════════════

  { register: "win", story: "star_went_off", tone: "hype", templates: [
    "{name} dropped {pts}{opp} and this hand absolutely cashed. That is a night you remember.",
    "{pts} points from {last}{opp}. Statement game and the hand is in the green. Take the money.",
    "Nobody was stopping {nick} tonight — {pts} points{opp} and the roster rode the wave to a win.",
    "{last} went off{opp}. {pts} points of pure dominance. The supporting cast just watched and collected.",
    "That is {nick} at full power. {pts} points{opp}. Cash the hand and enjoy the night.",
  ]},
  { register: "win", story: "star_went_off", tone: "warm", templates: [
    "Good night to have {name} on your roster. {pts} points{opp}, clean and efficient from start to finish.",
    "{pts} points{opp}. That is {last} doing exactly what you need from your top card every time out.",
    "The roster had a guy tonight. {name} set the tone{opp} and never let up. Comfortable win.",
    "{first} {last} came through big. {pts} points and the whole roster benefited from that kind of night.",
    "When {nick} is locked in like that, the hand takes care of itself. {pts} points{opp}. Easy money.",
  ]},
  { register: "win", story: "star_went_off", tone: "culture_wry", templates: [
    "{last} put up {pts}{opp} and honestly, someone should check on the opposing defense after that one.",
    "{nick} decided to remind everyone tonight. {pts} points. Message received loud and clear.",
    "Someone had to go for {pts}. {last} decided tonight was the night and nobody argued.",
    "{pts} from {nick}{opp}. At this point the stat line is just showing off for the audience.",
    "{name} treated this one like a personal vendetta. {pts} points of evidence submitted to the court.",
  ]},
  { register: "win", story: "star_went_off", tone: "observational", templates: [
    "{name} went for {pts}{opp}. The kind of night that single-handedly carries a winning hand from start to finish.",
    "{pts} from {last} tonight. When the star delivers at that level, everything else falls into place.",
    "{nick} was the entire story tonight. {pts} points{opp} and the hand followed right behind the star.",
    "The numbers tell it all: {pts} from {name}{opp}. That output made every other card look better.",
  ]},
  { register: "win", story: "star_went_off", tone: "analytical", templates: [
    "{name} came in well above the expected line{opp}. {pts} points — that is the upside you pay for.",
    "{last} exceeded average output by a wide margin tonight. The winning hand is the direct result.",
    "The anchor exceeded expectations across the board. {pts} from {name}{opp}. That is how you build a winner.",
    "Above-average output from {nick} tonight at {pts} points. The math worked and the hand cashed.",
  ]},
  { register: "win", story: "star_went_off", tone: "deadpan", templates: [
    "{last} went for {pts}{opp}. Won the hand. Nothing complicated about that outcome tonight.",
    "{pts} from {nick}{opp}. That will do. Cash the hand and move on to the next one.",
    "{name} handled business tonight. {pts} points{opp}. Not much else needs to be said about it.",
    "Big night from {last}. {pts} points. Hand won. On to the next opportunity ahead.",
  ]},

  // ═══ WIN — star_delivered ══════════════════════════════════════════════════

  { register: "win", story: "star_delivered", tone: "hype", templates: [
    "{name} showed up when it mattered{opp}. That is exactly what stars do on nights like this one.",
    "{last} brought it tonight. Not the biggest night ever, but more than enough to cash the hand.",
    "{nick} delivered and the roster followed right behind. Good hand all around for the lineup.",
    "Count on {last} to get it done{opp}. Steady production, steady win. That is the formula.",
    "Another solid night from {name}{opp}. The kind of showing that keeps the wins rolling in steadily.",
  ]},
  { register: "win", story: "star_delivered", tone: "warm", templates: [
    "Solid night from {name}{opp}. Did the job, the roster held up around the star. Take the win.",
    "{last} was steady all night{opp}. No fireworks needed, just a good result for the hand.",
    "Just a solid, professional night from {name}. The kind of hand that quietly adds up over time in your favor.",
    "Nothing flashy from {nick} but the roster got exactly what it needed. Wins are wins at the end.",
    "{last} kept the ship steady tonight{opp}. The supporting cast filled in the rest. Clean hand.",
  ]},
  { register: "win", story: "star_delivered", tone: "culture_wry", templates: [
    "{nick} did not break a sweat and still cashed the hand. Must be nice to have that kind of floor.",
    "{last} on cruise control is still better than most players in the league going full effort.",
    "Average {nick} night. The rest of us wish our average looked like that on any given Tuesday.",
    "Just another day at the office for {last}{opp}. Punched in, produced, collected the win quietly.",
    "{name} made it look boring and honestly that is a compliment in this game. Efficient and done.",
  ]},
  { register: "win", story: "star_delivered", tone: "observational", templates: [
    "{name} came in around the expected line{opp}. Consistent output and the hand benefited directly.",
    "{last} did what was expected tonight. The rest of the roster handled the margins around the star.",
    "Steady production from {nick}{opp}. Not spectacular, not disappointing. The hand reflects that balance.",
    "The star hit the mark and the supporting cast held their ground. {last} keeps it steady every night.",
  ]},
  { register: "win", story: "star_delivered", tone: "analytical", templates: [
    "{name} tracked close to average tonight{opp}. Consistent anchor play from the star got the win.",
    "The star hit the expected line. The supporting cast stayed in range. {last} anchored a clean hand.",
    "{last} delivered within the normal range{opp}. When the anchor is steady, the hand usually cashes.",
    "Expected output from {nick} tonight. Combined with roster support, the math worked for a win.",
  ]},
  { register: "win", story: "star_delivered", tone: "deadpan", templates: [
    "{last} did the job tonight{opp}. Won the hand. Moving on to whatever comes next in the schedule.",
    "{nick} was fine. The hand was fine. Next one is what matters now. Take the win and keep going.",
    "Standard night from {last}. Standard result for the hand. Nothing to overthink about this one.",
    "{name} produced, the roster won{opp}. Not every win needs a headline. This one was workmanlike.",
  ]},

  // ═══ WIN — star_quiet_win ═════════════════════════════════════════════════

  { register: "win", story: "star_quiet_win", tone: "hype", templates: [
    "The roster found a way without {name} going off. Team effort and it paid off when it counted.",
    "Quiet night from {nick} but the hand still cashed. The supporting cast stepped up and delivered.",
    "{last} was not the story tonight but the roster rallied and brought home a win anyway. Respect.",
    "Not the {name} show tonight, but the hand still cashed. Depth matters and it showed up here.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "warm", templates: [
    "{name} had a quiet one, but the roster held it together for the win. A win is a win in this game.",
    "Not {last}'s best night, but the hand survived and cashed. Take the money and keep it moving.",
    "{nick} was subdued tonight{opp} but the rest of the lineup picked up the slack. Good team hand.",
    "Even without a big game from {last}, the roster had enough. Sometimes depth wins the day for you.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "culture_wry", templates: [
    "{nick} took the night off and the roster covered for it beautifully. Teamwork makes the dream work.",
    "Even on a quiet night, {last}'s floor is someone else's ceiling. The hand survived just fine.",
    "{name} basically sleepwalked through this one and the roster still found a way to cash. Wild.",
    "The supporting cast carried {last} tonight and you know they will never let that story go either.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "observational", templates: [
    "{name} came in below average but the roster compensated for the shortfall. Balanced hand overall.",
    "Quiet from {last}{opp}. The supporting cards made up the difference and the hand still cashed.",
    "Below the typical line from {nick} tonight but the depth of the roster absorbed the dip cleanly.",
    "The star underproduced and the hand still won. That speaks to roster construction around {last}.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "analytical", templates: [
    "{name} fell short of the expected line tonight but roster depth covered the gap. Solid roster build.",
    "Below-average output from {last}{opp}. The supporting cast compensated and the hand stayed green.",
    "The anchor was down but the supporting cards delivered enough. {nick} had a rare quiet night.",
    "{last} came in under the line but the hand absorbed the variance. Roster depth proved its value.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "deadpan", templates: [
    "{last} was quiet tonight{opp}. Still won the hand. Does not matter how you get there in the end.",
    "Not a {nick} night. Still cashed the hand. The roster found a way without the star showing out.",
    "{name} did not do much tonight but the result is the same. A win is a win regardless of the how.",
    "Quiet from {last}. The hand still got there somehow. Moving on to the next one without complaint.",
  ]},

  // ═══ WIN — clean_win (no nameable star — but add star refs for when star exists) ════

  { register: "win", story: "clean_win", tone: "hype", templates: [
    "The roster came together tonight with {last} and the group finding a rhythm. Cash the hand.",
    "Everybody contributed alongside {name}. That is how you win a hand without needing a hero to carry it.",
    "No single player dominated but {last} and the roster all brought something to the table tonight.",
    "{name} and the full roster chipped in across the board. Collective effort and a collective win.",
  ]},
  { register: "win", story: "clean_win", tone: "warm", templates: [
    "Good hand. {last} and the roster did the job across the board without any drama tonight.",
    "No hero ball needed from {name}. The group effort from every card on the roster got it done.",
    "The whole roster contributed, {last} included. Balanced production and a comfortable win tonight.",
    "{name} and the supporting cast all showed up. Quiet competence across the board adds up to a win.",
  ]},
  { register: "win", story: "clean_win", tone: "culture_wry", templates: [
    "Nobody went nuclear but {last} and everybody else showed up. The committee approach actually worked.",
    "Win by committee with {name} chipping in. Not flashy, but the money spends the same in the end.",
    "{last} and the roster split the work evenly. Not exactly headline material but it got the job done.",
    "The whole squad including {nick} just quietly handled business tonight. No drama, no problems, just a win.",
  ]},
  { register: "win", story: "clean_win", tone: "observational", templates: [
    "Balanced output across the roster with {last} contributing steadily. No standout, just consistent play.",
    "No single card drove the result. {name} and the roster each did their part for a collective win.",
    "Even distribution tonight. {last} blended in with the group and the hand benefited from the balance.",
    "The roster functioned as a unit with {nick} doing a share of the work. Balanced and effective.",
  ]},
  { register: "win", story: "clean_win", tone: "analytical", templates: [
    "Contributions were spread evenly with {last} in the mix. Depth and balance won this hand tonight.",
    "No single driver in the lineup. {name} and the roster all stayed in range. Even distribution of value.",
    "{last} matched the group output. When everyone hits their marks, the hand takes care of itself.",
    "Balanced stat lines from {nick} and the roster. Mathematical consistency across all cards delivered.",
  ]},
  { register: "win", story: "clean_win", tone: "deadpan", templates: [
    "Won the hand. {last} and the roster all did a bit of the work. Nobody stood out. Next one is ahead.",
    "{name} was part of a group effort. Nothing special from any individual card. Got the win regardless.",
    "Committee win with {last} doing a share. Not exciting but it counts the same on the ledger.",
    "The roster including {nick} just did enough across the board. Hand cashed. Moving on to the next.",
  ]},

  // ═══ LOSS — star_no_showed ════════════════════════════════════════════════

  { register: "loss", story: "star_no_showed", tone: "deadpan", templates: [
    "{last} came in way below the line tonight{opp}. Not much else to say about this particular hand.",
    "Needed {nick} to show up tonight and it did not happen. The hand paid the price for that absence.",
    "{name} was a no-show{opp}. That is the whole story of the hand in one sentence right there.",
    "The star went missing tonight. {last} did not deliver and the hand had no chance without that output.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "warm", templates: [
    "Tough one tonight. {name} had an off night{opp} and the roster could not make up for it.",
    "{last} did not have it tonight. Happens to everyone eventually. Shake it off and play the next hand.",
    "Off night from {last}{opp}. The supporting cast tried their best but it was not enough to survive.",
    "Not the night {name} or the roster wanted{opp}. Sometimes the star goes cold and the hand follows.",
    "Rough outing for {nick} tonight. The rest of the roster could not overcome that gap at the top.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "culture_wry", templates: [
    "{nick} picked tonight to take a personal day and the roster noticed the absence immediately.",
    "{last} had more turnovers than highlights tonight and that is genuinely hard to do at this level.",
    "Way below the usual night from {name}. The supporting cast deserves an apology after carrying that.",
    "{last} went ghost{opp}. The box score is the evidence and it does not paint a pretty picture tonight.",
    "Someone should check on {nick} after that one. The stat line suggests a case of mistaken identity.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "observational", templates: [
    "{name} came in well below average{opp}. Hard to overcome that kind of deficit from your top card.",
    "{last} was the difference tonight — and not the good kind of difference you want from your star.",
    "The anchor fell way short of the mark tonight. {name}{opp} was the gap the roster could not close.",
    "When the top card produces like {last} did tonight, the supporting cast cannot cover that gap alone.",
  ]},
  { register: "loss", story: "star_no_showed", tone: "analytical", templates: [
    "{name} came in far below the expected line{opp}. At that salary, the hand needed a lot more output.",
    "{last}'s output was insufficient to sustain the hand tonight. The math simply was not there for a win.",
    "Way below the line from {nick}{opp}. The deficit at the anchor position sank the entire hand tonight.",
    "The numbers from {last} tonight were not close to adequate. That output gap cascaded through the hand.",
  ]},

  // ═══ LOSS — star_cold ═════════════════════════════════════════════════════

  { register: "loss", story: "star_cold", tone: "deadpan", templates: [
    "{last} was cold tonight{opp}. The hand followed that same direction downward. That is how it goes.",
    "Not {nick}'s night. It happens to everyone eventually. Shake it off and come back for the next one.",
    "{name} did not get it going tonight{opp}. The hand reflected that reality from start to finish.",
    "Below the line from {last}. Not disastrous but not nearly enough to get the hand into winning range.",
  ]},
  { register: "loss", story: "star_cold", tone: "warm", templates: [
    "{name} had a rough one tonight{opp}. One of those nights that you just want to forget happened.",
    "Below the line from {last}. The roster did not have enough firepower to cover the shortfall tonight.",
    "{nick} was not at the usual level tonight{opp}. It happens. Move on to the next hand and reset.",
    "Cold night from {name}{opp}. The supporting cast fought but the gap at the top was just too wide.",
  ]},
  { register: "loss", story: "star_cold", tone: "culture_wry", templates: [
    "{nick} played like someone told the star the game started at a different time tonight. Not ideal.",
    "{last} was off and everybody else was just okay. That is the recipe for a bust every single time.",
    "Somewhere out there is the version of {nick} who shows up. Tonight was not that version unfortunately.",
    "{last} did not get the memo tonight{opp}. The roster tried to cover but there is only so much to give.",
  ]},
  { register: "loss", story: "star_cold", tone: "observational", templates: [
    "{name} came in below average{opp}. The margin for error was thin tonight and it showed in the result.",
    "Below the expected line from {last}{opp}. When the star is cold, the hand rarely survives the drop.",
    "{nick} was not sharp tonight. The output gap at the top was the story of this particular hand.",
    "A colder-than-usual night from {last}{opp}. The supporting cast stayed in range but needed more help.",
  ]},
  { register: "loss", story: "star_cold", tone: "analytical", templates: [
    "{name} tracked below the expected line tonight{opp}. The margin from the supporting cast was not enough.",
    "Below-average output from {last} tonight. The hand needed more from the anchor spot to stay competitive.",
    "The numbers from {nick} fell short of the expected range{opp}. Insufficient cushion from the roster depth.",
    "{last} came in under the line and the rest of the roster did not compensate enough. Tight margins lost.",
  ]},

  // ═══ LOSS — everyone_flat ═════════════════════════════════════════════════

  { register: "loss", story: "everyone_flat", tone: "deadpan", templates: [
    "Nobody had it tonight including {last}. Sometimes the cards just do not come in your favor.",
    "Flat across the board with {nick} included. Not one card on the roster pulled its weight tonight.",
    "{last} and the rest of the roster all came in below the line. Nothing worked. On to the next one.",
    "The entire lineup missed tonight. {name} was no exception. Take the loss and move forward from here.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "warm", templates: [
    "Tough night all around for {last} and the roster. Nobody could get anything going out there tonight.",
    "The whole roster had an off night with {name} included. Take the loss and move on to the next hand.",
    "{nick} and the full group struggled tonight. One of those collective off nights that just happen.",
    "Not the night anyone on the roster wanted, {last} included. It happens. Reset and come back fresh.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "culture_wry", templates: [
    "The entire roster collectively decided to take the night off and {last} was not any different.",
    "If this hand was a group project, nobody did their part and {nick} was right there with them.",
    "{last} and the supporting cast all phoned it in tonight. A true team effort in the wrong direction.",
    "Everyone including {name} forgot to show up tonight. At least they were all consistent about it.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "observational", templates: [
    "No single culprit tonight. {last} and every other card came in below the line across the board.",
    "The roster fell short across the board with {name} included. A collective miss from top to bottom.",
    "{nick} and the full roster all fell short tonight. Broad struggles left no margin for the hand at all.",
    "A collective off night. {last} blended in with a roster that missed the mark from every position.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "analytical", templates: [
    "Every card tracked below the expected line including {last}. No individual cause — collective miss.",
    "{name} and the roster all came in under their expected outputs tonight. The broad miss sank the hand.",
    "Below the line across the board. {nick} was no exception. When everyone misses, the hand has no chance.",
    "Systematic shortfall from {last} and the full roster tonight. The cumulative deficit was too large to survive.",
  ]},
];
