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
    "{pts} from {last}{opp}. Statement game and the hand is in the green. Take the money.",
    "Nobody was stopping {nick} tonight — {pts}{opp} and the roster rode the wave to a win.",
    "{last} went off{opp}. {pts} of pure dominance. The supporting cast just watched and collected.",
    "That is {nick} at full power. {pts}{opp}. Cash the hand and enjoy the night.",
  ]},
  { register: "win", story: "star_went_off", tone: "warm", templates: [
    "Good night to have {name} on your roster. {pts}{opp}, clean and efficient from start to finish.",
    "{pts}{opp}. That is {last} doing exactly what you need from your top card every time out.",
    "The roster had a guy tonight. {name} set the tone{opp} and never let up. Comfortable win.",
    "{first} {last} came through big. {pts} and the whole roster benefited from that kind of night.",
    "When {nick} is locked in like that, the hand takes care of itself. {pts}{opp}. Easy money.",
  ]},
  { register: "win", story: "star_went_off", tone: "culture_wry", templates: [
    "{last} put up {pts}{opp} and honestly, someone should check on the opposing defense after that one.",
    "{nick} decided to remind everyone tonight. {pts}. Message received loud and clear.",
    "Someone had to go for {pts}. {last} decided tonight was the night and nobody argued.",
    "{pts} from {nick}{opp}. At this point the stat line is just showing off for the audience.",
    "{name} treated this one like a personal vendetta. {pts} of evidence submitted to the court.",
  ]},
  { register: "win", story: "star_went_off", tone: "observational", templates: [
    "{name} went for {pts}{opp}. The kind of night that single-handedly carries a winning hand from start to finish.",
    "{pts} from {last} tonight. When the star delivers at that level, everything else falls into place.",
    "{nick} was the entire story tonight. {pts}{opp} and the hand followed right behind the star.",
    "The numbers tell it all: {pts} from {name}{opp}. That output made every other card look better.",
  ]},
  { register: "win", story: "star_went_off", tone: "analytical", templates: [
    "{name} came in well above the expected line{opp}. {pts} — that is the upside you pay for.",
    "{last} exceeded average output by a wide margin tonight. The winning hand is the direct result.",
    "The anchor exceeded expectations across the board. {pts} from {name}{opp}. That is how you build a winner.",
    "Above-average output from {nick} tonight at {pts}. The math worked and the hand cashed.",
  ]},
  { register: "win", story: "star_went_off", tone: "deadpan", templates: [
    "{last} went for {pts}{opp}. Won the hand. Nothing complicated about that outcome tonight.",
    "{pts} from {nick}{opp}. That will do. Cash the hand and move on to the next one.",
    "{name} handled business tonight. {pts}{opp}. Not much else needs to be said about it.",
    "Big night from {last}. {pts}. Hand won. On to the next opportunity ahead.",
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
    "Balanced output across the roster. No standout card, just consistent play from top to bottom.",
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

  // ═══ LOSS — star_carried_loss (star went off but team still busted) ═══════

  { register: "loss", story: "star_carried_loss", tone: "warm", templates: [
    "{name} did everything possible{opp}. The rest of the roster let that night go to waste.",
    "{last} showed up in a major way but it was not enough. The supporting cast did not hold up their end.",
    "Heartbreaker. {nick} went off and the hand still busted. The lineup around the star could not keep up.",
    "You can not ask more from {name} than what was delivered tonight. The loss falls on everyone else.",
  ]},
  { register: "loss", story: "star_carried_loss", tone: "culture_wry", templates: [
    "{nick} went nuclear and it still was not enough. The supporting cast owes a formal apology tonight.",
    "{last} put on a show{opp} and nobody else bought a ticket. Tough way to lose a hand.",
    "Imagine going off like {nick} did tonight and still losing. The bench should be embarrassed.",
    "{name} carried the whole roster on one back and the roster said thanks but no thanks. Brutal.",
    "{last} did the job of three players tonight. The other cards did the job of zero.",
  ]},
  { register: "loss", story: "star_carried_loss", tone: "observational", templates: [
    "{name} vastly exceeded the expected line{opp} but the rest of the roster underdelivered across the board.",
    "The star carried. The supporting cast did not follow. {last} deserved a better outcome than this tonight.",
    "{nick} had an elite night but the deficit from the rest of the lineup was too deep to overcome.",
    "When the star delivers like {last} did and the hand still busts, the problem is everywhere else.",
  ]},
  { register: "loss", story: "star_carried_loss", tone: "analytical", templates: [
    "{name} came in far above the expected line{opp}. The loss is entirely attributable to the supporting cards.",
    "Elite output from {last} was offset by the rest of the lineup falling short across the board tonight.",
    "The anchor overdelivered significantly. The math still did not work because every other card missed.",
  ]},
  { register: "loss", story: "star_carried_loss", tone: "deadpan", templates: [
    "{last} went off{opp}. Still lost. The rest of the roster was not there tonight. It happens.",
    "{nick} did the job and then some. Everybody else did not. That is the whole story of this hand.",
    "Big night from {last}. Did not matter. The lineup around the star was not close to enough.",
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

  // ═══ WIN — star_rare_badge (badge IS the story) ══════════════════════════

  { register: "win", story: "star_rare_badge", tone: "hype", templates: [
    "A {topStat} {badge} from {name}{opp}. That is how you announce yourself. The hand cashed hard.",
    "{name} posted a {badge}{opp}. A {topStat} {badge} is a statement and the whole roster rode that wave.",
    "Someone had to step up. {last} decided tonight was the night. A {topStat} {badge} is how you do it.",
    "{nick} just dropped a {badge}{opp}. {topStat} leading the way and the hand was never in doubt.",
    "{last} with the {badge}{opp}. When you put up a {topStat} {badge} the rest of the roster just watches.",
  ]},
  { register: "win", story: "star_rare_badge", tone: "warm", templates: [
    "{name} put together a {badge}{opp}. A {topStat} {badge} is exactly what this hand needed tonight.",
    "That is a {badge} from {last}{opp}. {topStat} leading the stat line and the hand came together nicely.",
    "Good night to have {name} on the roster. A {topStat} {badge} is the kind of line you build a hand around.",
    "{last} came through with a {badge}{opp}. {topStat} on top and the supporting cast held up their end.",
    "A clean {badge} from {nick}{opp}. {topStat} headlining the stat sheet and the hand cashed comfortably.",
  ]},
  { register: "win", story: "star_rare_badge", tone: "culture_wry", templates: [
    "{nick} casually posted a {badge}{opp}. A {topStat} {badge} like it was just another Tuesday for the star.",
    "Someone had to step up. {last} decided tonight was the night and nobody argued. A {topStat} {badge} is a great way to do it.",
    "{last} put up a {badge}{opp} and honestly the rest of the league should be taking notes right now.",
    "A {topStat} {badge} from {name}. That is not normal. That is generational and the hand reflects it.",
    "{nick} dropped a {badge}{opp} and made it look like it required zero effort. The hand printed money.",
  ]},
  { register: "win", story: "star_rare_badge", tone: "observational", templates: [
    "{name} recorded a {badge}{opp}. A {topStat} {badge} is the kind of stat line that defines a hand entirely.",
    "The story tonight is the {badge} from {last}{opp}. {topStat} headlining a stat line that carried the hand.",
    "{last} put together a {badge} tonight. When someone posts a {topStat} {badge} nothing else matters.",
    "A {topStat} {badge} from {nick}{opp}. That kind of all-around production is the difference maker in any hand.",
    "The numbers from {name} tonight tell the whole story. A {badge}{opp} with {topStat} leading the way.",
  ]},
  { register: "win", story: "star_rare_badge", tone: "analytical", templates: [
    "{name} filled the stat sheet across the board{opp}. A {topStat} {badge} is the kind of output that wins hands.",
    "A {badge} from {last}{opp}. Multi-category production with {topStat} at the top. The hand benefited directly.",
    "{last} posted a {topStat} {badge} tonight. That level of all-around output anchored the entire hand.",
    "The anchor hit on every category tonight. A {badge} from {nick}{opp} with {topStat} leading the line.",
  ]},
  { register: "win", story: "star_rare_badge", tone: "deadpan", templates: [
    "{last} had a {badge}{opp}. {topStat} on top. Won the hand. Not much else needs to be said about it.",
    "A {topStat} {badge} from {nick}{opp}. Cash the hand and move on. That stat line speaks for itself.",
    "{name} posted a {badge} tonight. {topStat} leading the way. Hand won. On to the next one.",
    "{last} quietly put together a {badge}{opp}. {topStat} headlining it. The result was never in doubt.",
  ]},

  // ═══ LOSS — star_rare_badge (badge spotlight but hand still busted) ═══════

  { register: "loss", story: "star_rare_badge", tone: "warm", templates: [
    "{name} put up a {badge}{opp} and the hand still busted. A {topStat} {badge} deserved a better outcome.",
    "Tough one. {last} posted a {badge}{opp} with {topStat} leading the stat line but it was not enough tonight.",
    "A {topStat} {badge} from {nick}{opp} and still a loss. The supporting cast let that performance go to waste.",
    "{last} did everything right tonight. A {badge} with {topStat} up top and the roster could not keep up.",
  ]},
  { register: "loss", story: "star_rare_badge", tone: "culture_wry", templates: [
    "{nick} posted a {badge}{opp} and the hand still busted. A {topStat} {badge} wasted. Someone owes an apology.",
    "A {topStat} {badge} from {last} and somehow the hand lost. The supporting cast should be embarrassed.",
    "{name} had a {badge}{opp}. {topStat} on top of everything else. The fact this hand lost is genuinely criminal.",
    "Imagine dropping a {topStat} {badge} like {nick} did tonight and still losing. That is a roster problem.",
  ]},
  { register: "loss", story: "star_rare_badge", tone: "observational", templates: [
    "{name} recorded a {badge}{opp} but the hand still fell short. A {topStat} {badge} was not enough to save it.",
    "The star posted a {topStat} {badge}{opp}. The rest of the roster created a deficit too deep to overcome.",
    "{last} filled the entire stat sheet tonight. A {badge} with {topStat} leading and the hand still busted.",
    "A {topStat} {badge} from {nick}{opp} and a loss. The gap between the star and the roster was too wide.",
  ]},
  { register: "loss", story: "star_rare_badge", tone: "analytical", templates: [
    "{name} posted a {badge}{opp} with {topStat} leading the line. The supporting cards fell far short of covering.",
    "A {topStat} {badge} from {last}{opp} was not sufficient. The deficit from the rest of the roster was too large.",
    "{last} filled every category tonight with a {badge}. The hand lost despite elite output from the anchor.",
  ]},
  { register: "loss", story: "star_rare_badge", tone: "deadpan", templates: [
    "{last} had a {badge}{opp}. {topStat} on top. Still lost. The roster around the star was not there tonight.",
    "A {topStat} {badge} from {nick}{opp}. Not enough. The supporting cast did not hold up. It happens.",
    "{name} posted a {badge} tonight and it did not matter. The hand needed more from everyone else.",
  ]},
];
