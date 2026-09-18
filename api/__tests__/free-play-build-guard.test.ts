import {expect,it} from 'vitest';
import {assertFreePlayBundle} from '../../scripts/check-free-play-build.mjs';
it.each(['Daily Bonus Pool','/api/bonus-pool','grant_coins','replaymod_balance','calculatePayout','betMultiplier','payout:20','Cash the hand','coins added'])('rejects a shipped economy regression: %s',text=>expect(()=>assertFreePlayBundle(text)).toThrow(/forbidden economy/));
it('allows score tiers, lineup costs and defensive filtering of old messages',()=>expect(()=>assertFreePlayBundle('Team FP 250 lineup budget ROOKIE LEGEND /coins?|payouts?|wallet/')).not.toThrow());
