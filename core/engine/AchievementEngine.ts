/**
 * AchievementEngine - Evaluates achievements and applies fantasy point modifiers
 * Sport-agnostic achievement evaluation based on GameLog stats and events
 */

import {
  GameLog,
  AchievementRule,
  TriggerCondition,
  RewardEffect,
  TriggeredAchievement,
} from '../models';

export interface AchievementEvaluationResult {
  totalBonus: number;
  triggeredAchievements: TriggeredAchievement[];
}

export class AchievementEngine {
  /**
   * Evaluate all achievement rules against a game log
   * Returns total bonus/penalty FP and list of triggered achievements
   */
  static evaluateAchievements(
    gameLog: GameLog,
    rules: AchievementRule[]
  ): AchievementEvaluationResult {
    const triggeredAchievements: TriggeredAchievement[] = [];
    let totalBonus = 0;

    for (const rule of rules) {
      if (this.evaluateTrigger(gameLog, rule.trigger)) {
        const rewardFP = this.applyReward(0, rule.reward); // Base FP is 0, we just want the modifier
        totalBonus += rewardFP;
        triggeredAchievements.push({
          ruleId: rule.id,
          playerId: gameLog.playerId,
          reward: rule.reward,
          visual: rule.visual,
        });
      }
    }

    return {
      totalBonus,
      triggeredAchievements,
    };
  }

  /**
   * Evaluate a trigger condition against a game log
   */
  private static evaluateTrigger(
    gameLog: GameLog,
    trigger: TriggerCondition
  ): boolean {
    switch (trigger.type) {
      case 'STAT_THRESHOLD': {
        const statValue = gameLog.stats[trigger.stat] || 0;
        return this.evaluateComparison(
          statValue,
          trigger.operator,
          trigger.value
        );
      }

      case 'EVENT_COUNT': {
        const eventCount = gameLog.events[trigger.event] || 0;
        return this.evaluateComparison(
          eventCount,
          trigger.operator,
          trigger.value
        );
      }

      case 'COMPOSITE': {
        return trigger.all.every((condition) =>
          this.evaluateTrigger(gameLog, condition)
        );
      }

      default: {
        const _exhaustive: never = trigger;
        throw new Error(`Unknown trigger type: ${_exhaustive}`);
      }
    }
  }

  /**
   * Evaluate a comparison operator
   */
  private static evaluateComparison(
    value: number,
    operator: '>=' | '<=' | '>',
    threshold: number
  ): boolean {
    switch (operator) {
      case '>=':
        return value >= threshold;
      case '<=':
        return value <= threshold;
      case '>':
        return value > threshold;
      default: {
        const _exhaustive: never = operator;
        throw new Error(`Unknown operator: ${_exhaustive}`);
      }
    }
  }

  /**
   * Apply a reward effect to base FP
   * Returns the modifier amount (positive for bonus, negative for penalty)
   */
  static applyReward(baseFP: number, reward: RewardEffect): number {
    switch (reward.type) {
      case 'BONUS_FP':
        return reward.value;

      case 'PENALTY_FP':
        return -reward.value;

      case 'MULTIPLIER': {
        const multipliedFP = baseFP * reward.value;
        return multipliedFP - baseFP; // Return the bonus amount
      }

      default: {
        const _exhaustive: never = reward;
        throw new Error(`Unknown reward type: ${_exhaustive}`);
      }
    }
  }

  /**
   * Apply achievements to a base fantasy point value
   * Returns the final FP after applying all modifiers
   */
  static applyAchievementsToFP(
    baseFP: number,
    triggeredAchievements: TriggeredAchievement[]
  ): number {
    let finalFP = baseFP;

    for (const achievement of triggeredAchievements) {
      switch (achievement.reward.type) {
        case 'BONUS_FP':
          finalFP += achievement.reward.value;
          break;

        case 'PENALTY_FP':
          finalFP -= achievement.reward.value;
          break;

        case 'MULTIPLIER':
          finalFP = finalFP * achievement.reward.value;
          break;
      }
    }

    return finalFP;
  }
}
