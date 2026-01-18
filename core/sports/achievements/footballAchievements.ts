/**
 * Football (Soccer) Achievements
 * Position-scoped achievements using stat gating (no position field in rules)
 */

import { AchievementRule } from '../../models';

export const FootballAchievements: AchievementRule[] = [
  // FWD-like: requires goals/shots_on_target
  {
    id: 'brace',
    name: 'Brace',
    trigger: {
      type: 'STAT_THRESHOLD',
      stat: 'goals',
      operator: '>=',
      value: 2,
    },
    reward: {
      type: 'BONUS_FP',
      value: 6,
    },
    visual: {
      badgeId: 'brace',
      animation: 'flash',
      sound: 'achievement_positive',
    },
  },
  {
    id: 'hat-trick',
    name: 'Hat Trick',
    trigger: {
      type: 'STAT_THRESHOLD',
      stat: 'goals',
      operator: '>=',
      value: 3,
    },
    reward: {
      type: 'BONUS_FP',
      value: 12,
    },
    visual: {
      badgeId: 'hat-trick',
      animation: 'burst',
      sound: 'achievement_rare',
    },
  },

  // MID-like: requires high passes + key passes
  {
    id: 'playmaker',
    name: 'Playmaker',
    trigger: {
      type: 'STAT_THRESHOLD',
      stat: 'key_passes',
      operator: '>=',
      value: 3,
    },
    reward: {
      type: 'BONUS_FP',
      value: 6,
    },
    visual: {
      badgeId: 'playmaker',
      animation: 'flash',
      sound: 'achievement_positive',
    },
  },
  {
    id: 'conductor',
    name: 'Conductor',
    trigger: {
      type: 'STAT_THRESHOLD',
      stat: 'passes_completed',
      operator: '>=',
      value: 80,
    },
    reward: {
      type: 'BONUS_FP',
      value: 6,
    },
    visual: {
      badgeId: 'conductor',
      animation: 'flash',
      sound: 'achievement_positive',
    },
  },

  // DEF-like: requires blocks/tackles/interceptions
  {
    id: 'shutdown',
    name: 'Shutdown',
    trigger: {
      type: 'COMPOSITE',
      all: [
        { type: 'STAT_THRESHOLD', stat: 'tackles_won', operator: '>=', value: 5 },
        { type: 'STAT_THRESHOLD', stat: 'interceptions', operator: '>=', value: 3 },
      ],
    },
    reward: {
      type: 'BONUS_FP',
      value: 8,
    },
    visual: {
      badgeId: 'shutdown',
      animation: 'flash',
      sound: 'achievement_positive',
    },
  },
  {
    id: 'brick-wall',
    name: 'Brick Wall',
    trigger: {
      type: 'STAT_THRESHOLD',
      stat: 'blocks',
      operator: '>=',
      value: 4,
    },
    reward: {
      type: 'BONUS_FP',
      value: 6,
    },
    visual: {
      badgeId: 'brick-wall',
      animation: 'flash',
      sound: 'achievement_positive',
    },
  },

  // GK-like: requires saves
  {
    id: 'shot-stopper',
    name: 'Shot Stopper',
    trigger: {
      type: 'STAT_THRESHOLD',
      stat: 'saves',
      operator: '>=',
      value: 6,
    },
    reward: {
      type: 'BONUS_FP',
      value: 8,
    },
    visual: {
      badgeId: 'shot-stopper',
      animation: 'flash',
      sound: 'achievement_positive',
    },
  },
  {
    id: 'clean-sheet-gk',
    name: 'Clean Sheet (GK)',
    trigger: {
      type: 'COMPOSITE',
      all: [
        { type: 'STAT_THRESHOLD', stat: 'goals_conceded', operator: '<=', value: 0 },
        { type: 'STAT_THRESHOLD', stat: 'saves', operator: '>=', value: 1 },
        { type: 'STAT_THRESHOLD', stat: 'minutes', operator: '>=', value: 60 },
      ],
    },
    reward: {
      type: 'BONUS_FP',
      value: 10,
    },
    visual: {
      badgeId: 'clean-sheet-gk',
      animation: 'burst',
      sound: 'achievement_rare',
    },
  },
  {
    id: 'clean-sheet-def',
    name: 'Clean Sheet (DEF)',
    trigger: {
      type: 'COMPOSITE',
      all: [
        { type: 'STAT_THRESHOLD', stat: 'goals_conceded', operator: '<=', value: 0 },
        { type: 'STAT_THRESHOLD', stat: 'blocks', operator: '>=', value: 1 },
        { type: 'STAT_THRESHOLD', stat: 'minutes', operator: '>=', value: 60 },
      ],
    },
    reward: {
      type: 'BONUS_FP',
      value: 10,
    },
    visual: {
      badgeId: 'clean-sheet-def',
      animation: 'burst',
      sound: 'achievement_rare',
    },
  },

  // Negative: applies to anyone
  {
    id: 'sent-off',
    name: 'Sent Off',
    trigger: {
      type: 'EVENT_COUNT',
      event: 'red_cards',
      operator: '>=',
      value: 1,
    },
    reward: {
      type: 'PENALTY_FP',
      value: 8,
    },
    visual: {
      badgeId: 'sent-off',
      animation: 'shake',
      sound: 'achievement_negative',
    },
  },
];
