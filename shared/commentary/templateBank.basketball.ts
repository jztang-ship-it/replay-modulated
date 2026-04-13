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
    "Good hand across the board. Everyone did their part and the result speaks for itself tonight.",
    "Roster clicked tonight. No drama, no heroics needed. Just a clean hand that cashed when it mattered.",
  ]},
  { register: "win", story: "star_delivered", tone: "warm", templates: [
    "Solid night from {name}{opp}. Did the job, the roster held up around the star. Take the win.",
    "{last} was steady all night{opp}. No fireworks needed, just a good result for the hand.",
    "Just a solid, professional night from {name}. The kind of hand that quietly adds up over time in your favor.",
    "Nothing flashy from {nick} but the roster got exactly what it needed. Wins are wins at the end.",
    "{last} kept the ship steady tonight{opp}. The supporting cast filled in the rest. Clean hand.",
    "The kind of hand you want every time. Steady across the board, no surprises, money in the account.",
    "Clean win tonight. Everyone contributed, nobody had to carry anyone else. That is the blueprint.",
  ]},
  { register: "win", story: "star_delivered", tone: "culture_wry", templates: [
    "{nick} did not break a sweat and still cashed the hand. Must be nice to have that kind of floor.",
    "{last} on cruise control is still better than most players in the league going full effort.",
    "Average {nick} night. The rest of us wish our average looked like that on any given Tuesday.",
    "Just another day at the office for {last}{opp}. Punched in, produced, collected the win quietly.",
    "{name} made it look boring and honestly that is a compliment in this game. Efficient and done.",
    "Boring win. Best kind of win. The lineup handled business without anyone needing to be a hero tonight.",
    "The handbook says this is how you are supposed to win. Nobody told the roster it would be this easy.",
  ]},
  { register: "win", story: "star_delivered", tone: "observational", templates: [
    "{name} came in around the expected line{opp}. Consistent output and the hand benefited directly.",
    "{last} did what was expected tonight. The rest of the roster handled the margins around the star.",
    "Steady production from {nick}{opp}. Not spectacular, not disappointing. The hand reflects that balance.",
    "The star hit the mark and the supporting cast held their ground. {last} keeps it steady every night.",
    "Balanced contributions across the roster tonight. Nobody carried, nobody dropped. Solid result.",
    "The roster did what it was built to do tonight. No single card had to do too much to get the win.",
  ]},
  { register: "win", story: "star_delivered", tone: "analytical", templates: [
    "{name} tracked close to average tonight{opp}. Consistent anchor play from the star got the win.",
    "The star hit the expected line. The supporting cast stayed in range. {last} anchored a clean hand.",
    "{last} delivered within the normal range{opp}. When the anchor is steady, the hand usually cashes.",
    "Expected output from {nick} tonight. Combined with roster support, the math worked for a win.",
    "The roster tracked within expected ranges across the board. Consistent inputs, consistent output.",
  ]},
  { register: "win", story: "star_delivered", tone: "deadpan", templates: [
    "{last} did the job tonight{opp}. Won the hand. Moving on to whatever comes next in the schedule.",
    "{nick} was fine. The hand was fine. Next one is what matters now. Take the win and keep going.",
    "Standard night from {last}. Standard result for the hand. Nothing to overthink about this one.",
    "{name} produced, the roster won{opp}. Not every win needs a headline. This one was workmanlike.",
    "Won. Nothing interesting happened. That is fine. Cash it and move on to the next one ahead.",
    "Another one in the win column. Not much to talk about. Not much needs to be said either.",
  ]},

  // ═══ WIN — star_quiet_win ═════════════════════════════════════════════════

  { register: "win", story: "star_quiet_win", tone: "hype", templates: [
    "The roster found a way without {name} going off. Team effort and it paid off when it counted.",
    "Quiet night from {nick} but the hand still cashed. The supporting cast stepped up and delivered.",
    "{last} was not the story tonight but the roster rallied and brought home a win anyway. Respect.",
    "Not the {name} show tonight, but the hand still cashed. Depth matters and it showed up here.",
    "The bench showed out tonight. Quiet hand from the top but the depth came through in a big way.",
    "Won it on depth alone. Sometimes the supporting cast writes the story and tonight was that night.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "warm", templates: [
    "{name} had a quiet one, but the roster held it together for the win. A win is a win in this game.",
    "Not {last}'s best night, but the hand survived and cashed. Take the money and keep it moving.",
    "{nick} was subdued tonight{opp} but the rest of the lineup picked up the slack. Good team hand.",
    "Even without a big game from {last}, the roster had enough. Sometimes depth wins the day for you.",
    "Quiet night from the top of the lineup but the roster depth held. Sometimes that is all you need.",
    "The supporting cast picked up the slack tonight. Not every win comes from the star and that is okay.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "culture_wry", templates: [
    "{nick} took the night off and the roster covered for it beautifully. Teamwork makes the dream work.",
    "Even on a quiet night, {last}'s floor is someone else's ceiling. The hand survived just fine.",
    "{name} basically sleepwalked through this one and the roster still found a way to cash. Wild.",
    "The supporting cast carried {last} tonight and you know they will never let that story go either.",
    "The bench said we got this tonight. And honestly, they were not wrong about that at all.",
    "Won it without the star going off. The supporting cast has been waiting for this moment all season.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "observational", templates: [
    "{name} came in below average but the roster compensated for the shortfall. Balanced hand overall.",
    "Quiet from {last}{opp}. The supporting cards made up the difference and the hand still cashed.",
    "Below the typical line from {nick} tonight but the depth of the roster absorbed the dip cleanly.",
    "The star underproduced and the hand still won. That speaks to roster construction around {last}.",
    "The hand won despite the star running cold. Depth across the lineup made the difference tonight.",
    "Not a star-driven win. The supporting cast filled in across the board and the hand survived.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "analytical", templates: [
    "{name} fell short of the expected line tonight but roster depth covered the gap. Solid roster build.",
    "Below-average output from {last}{opp}. The supporting cast compensated and the hand stayed green.",
    "The anchor was down but the supporting cards delivered enough. {nick} had a rare quiet night.",
    "{last} came in under the line but the hand absorbed the variance. Roster depth proved its value.",
    "Star output was down but the supporting cards compensated. The math still worked for a win tonight.",
  ]},
  { register: "win", story: "star_quiet_win", tone: "deadpan", templates: [
    "{last} was quiet tonight{opp}. Still won the hand. Does not matter how you get there in the end.",
    "Not a {nick} night. Still cashed the hand. The roster found a way without the star showing out.",
    "{name} did not do much tonight but the result is the same. A win is a win regardless of the how.",
    "Quiet from {last}. The hand still got there somehow. Moving on to the next one without complaint.",
    "Won. The star was quiet. The bench was not. Sometimes that is the formula and that is fine.",
    "Not the prettiest win. Still a win. Take it and move on to whatever comes next in the schedule.",
  ]},

  // ═══ WIN — clean_win (no nameable star — but add star refs for when star exists) ════

  { register: "win", story: "clean_win", tone: "hype", templates: [
    "The whole roster came together tonight and found a rhythm. Cash the hand and feel good about it.",
    "Everybody contributed. That is how you win a hand without needing a hero to carry the whole thing.",
    "No single player dominated but the roster all brought something to the table tonight. Team win.",
    "Full roster effort across the board. Collective energy and a collective win. That is the blueprint.",
  ]},
  { register: "win", story: "clean_win", tone: "warm", templates: [
    "Good hand. The roster did the job across the board without any drama tonight. Take the win.",
    "No hero ball needed. The group effort from every card on the roster got it done. Comfortable night.",
    "The whole roster contributed. Balanced production and a comfortable win tonight. Nothing to complain about.",
    "Quiet competence across the board adds up to a win. Every card pulled its weight and it showed.",
  ]},
  { register: "win", story: "clean_win", tone: "culture_wry", templates: [
    "Nobody went nuclear but everybody showed up. The committee approach actually worked for once tonight.",
    "Win by committee. Not flashy, but the money spends the same in the end. Take it and move on.",
    "The roster split the work evenly. Not exactly headline material but it got the job done tonight.",
    "The whole squad just quietly handled business tonight. No drama, no problems, just a clean win.",
  ]},
  { register: "win", story: "clean_win", tone: "observational", templates: [
    "Balanced output across the roster. No standout performer, just consistent play from top to bottom.",
    "No single card drove the result. The roster each did their part for a collective win tonight.",
    "Even distribution tonight. The lineup blended together and the hand benefited from that balance.",
    "The roster functioned as a unit. Balanced and effective. That is what roster depth looks like.",
  ]},
  { register: "win", story: "clean_win", tone: "analytical", templates: [
    "Contributions were spread evenly across the roster. Depth and balance won this hand tonight.",
    "No single driver in the lineup. The roster all stayed within range. Even distribution of output.",
    "When everyone hits their marks, the hand takes care of itself. That is what happened here tonight.",
    "Balanced stat lines across the board. Mathematical consistency from all cards delivered the win.",
  ]},
  { register: "win", story: "clean_win", tone: "deadpan", templates: [
    "Won the hand. Nobody stood out. Nobody needed to. On to the next one ahead in the schedule.",
    "Group effort. Nothing special from any individual card. Got the win regardless. Moving on now.",
    "Committee win. Not exciting but it counts the same on the ledger. Next hand is what matters.",
    "The roster did just enough across the board. Hand cashed. Nothing more to say about this one.",
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
    "Nobody had it tonight. Sometimes the cards just do not come in your favor. On to the next one.",
    "Flat across the board. Not one card on the roster pulled its weight tonight. It happens.",
    "The whole roster came in below the line. Nothing worked. Nothing to say. On to the next hand.",
    "The entire lineup missed tonight. Take the loss and move forward from here. Next hand matters more.",
    "{last} and the rest of the roster all came in below the line. Nothing worked. On to the next one.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "warm", templates: [
    "Tough night all around. Nobody could get anything going out there tonight. It happens sometimes.",
    "The whole roster had an off night. Take the loss and move on to the next hand. Fresh start ahead.",
    "One of those collective off nights that just happen. Nobody is to blame. Reset and come back fresh.",
    "Not the night anyone wanted. The whole lineup was cold. It happens. Next hand is a clean slate.",
    "{name} and the full group struggled tonight. One of those nights you just want to forget quickly.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "culture_wry", templates: [
    "The entire roster collectively decided to take the night off. At least they committed to the bit.",
    "If this hand was a group project, nobody did their part. A true collective effort in the wrong direction.",
    "Everyone forgot to show up tonight. At least they were all consistent about that one thing.",
    "The roster phoned it in tonight. A team effort in the wrong direction. Very unified in their mediocrity.",
    "{last} and the supporting cast all phoned it in together. Team chemistry in the worst possible way.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "observational", templates: [
    "No single culprit tonight. Every card came in below the line across the board. Collective miss.",
    "The roster fell short across the board. A collective miss from top to bottom of the lineup tonight.",
    "Broad struggles left no margin for the hand at all. Nobody stepped up when the lineup needed it most.",
    "A collective off night. The roster missed the mark from every position. Nothing you could have done.",
    "{nick} and the full roster all fell short tonight. No individual cause — the whole hand was flat.",
  ]},
  { register: "loss", story: "everyone_flat", tone: "analytical", templates: [
    "Every card tracked below the expected line. No individual cause — this was a systemic collective miss.",
    "The roster all came in under their expected outputs tonight. The broad miss sank the hand completely.",
    "Below the line across the board. When everyone misses, the hand has no chance no matter the build.",
    "Systematic shortfall from the full roster tonight. The cumulative deficit was just too large to survive.",
    "{last} and the rest of the lineup all underdelivered. The math was not there from any single position.",
  ]},
];
