// Free-play branch commentary. Full economy copy is preserved on mother.
function pick(arr: string[]): string { return arr[Math.floor(Math.random() * arr.length)] ?? arr[0]; }
export type ChadTopic =
  | "welcome"
  | "daily_return"
  | "win_back"
  | "streak_intro"
  | "rookie_first_win"
  | "leaderboard_intro"
  | "leaderboard_explainer"
  | "big_win"
  | "retention"
  | "mvp_thanks"
  | "dev_4thwall";

const FREE_PLAY_BANKS: Record<ChadTopic, string[]> = {
  welcome: [
    "Build a five-player lineup, then see what real history says. Tap the info icon for the scoring rules.",
    "Training wheels off. The info icon has the scoring rules and the score to chase.",
    "You're playing for points now. Tap the info icon for rules and targets, then make your lineup.",
  ],
  daily_return: [
    "You're back. New slate, same challenge: build the best five-player lineup.",
    "New day, new lineup options. See what kind of five you can build.",
  ],
  win_back: [
    "Been a minute. The slate is ready when you are.",
    "Welcome back. Pick a lineup and see how history treats it.",
  ],
  streak_intro: [
    "Two strong hands in a row. Keep building on it.",
    "Back to back. See if you can make it three.",
  ],
  rookie_first_win: [
    "ROOKIE tier. Check the legend to see the next score to beat.",
    "You cleared the first tier. The info icon shows how the score bands work.",
  ],
  leaderboard_intro: [
    "You made the board. Save your account so your score stays with you.",
    "You landed on the leaderboard. Take a look at the scores above you.",
  ],
  leaderboard_explainer: [
    "The leaderboard tracks the best hands and sessions. Build a score worth chasing.",
    "Your best hand and best session both count on the board. Keep refining the lineup.",
  ],
  big_win: [
    "That's a real score. Save your account so you keep the result.",
    "Nice hand. Create an account if you want this progress to follow you.",
  ],
  retention: [
    "Twelve hands deep. Save your account so your progress is not tied to this browser.",
    "You're becoming a regular. Create an account to keep your history.",
  ],
  mvp_thanks: [
    "You're in the early rooms of this thing. Every hand you play helps us tune it. Thanks for sticking with it.",
    "Most testers bounce by now. You didn't. Sessions like yours are helping us calibrate the game.",
    "Honest aside from us: we wrote every line and tuned every number. You playing means we learn. Thanks for being here.",
  ],
  dev_4thwall: [
    "Quick break — Chad steps aside. You're playing an early version, and every hand helps us improve it. If something feels weird, tell us.",
    "Real talk for a second. We're a small team trying to make fantasy sports surprising again. If a hand feels off, tell us.",
    "You're one of the first people playing the full loop. We're grateful, nervous, and fixing things as we learn. Thanks for the time.",
  ],
};


export function chadMessage(topic: ChadTopic, _freePlay = true): string { return pick(FREE_PLAY_BANKS[topic]); }

export function chadBank(topic: ChadTopic, _freePlay = true): readonly string[] { return FREE_PLAY_BANKS[topic]; }
