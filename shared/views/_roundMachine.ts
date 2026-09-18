import type { PlayerCard } from '@shared/types';

export const MAX_ROUNDS = 3;
export interface LockRecord { roster: PlayerCard[]; totalFp: number; tier: string }
export interface PersistResult { ok: boolean; handId: string; reason?: 'timeout' | 'throw' }
export interface RoundLockEffects {
 telemetry: (event: 'lineup_locked', meta?: Record<string,string|number|boolean|null>) => void;
 persistLock: (record: LockRecord) => Promise<PersistResult>;
}
export interface CommitRoundInput {
 roundsUsed: number; maxRounds: number; userTappedReveal: boolean;
 resolvedRoster: PlayerCard[];
 resolveOutcome: (roster: PlayerCard[]) => {totalFp:number;tier:string};
 effects: RoundLockEffects;
}
export interface CommitRoundResult { next:'HOLD'|'REVEALING';roundsUsed:number;locked:boolean }
/** Selection-only decision, also used before challenge server resolution. */
export function advanceRound(input: Pick<CommitRoundInput,'roundsUsed'|'maxRounds'|'userTappedReveal'>): CommitRoundResult {
 const roundsUsed=input.roundsUsed+1;
 const locked=input.userTappedReveal || roundsUsed>=input.maxRounds;
 return {next:locked?'REVEALING':'HOLD',roundsUsed,locked};
}
/** Advance selection rounds; reveal only a confirmed score record. */
export async function commitRound(input:CommitRoundInput):Promise<CommitRoundResult> {
 const {roundsUsed,maxRounds,userTappedReveal,resolvedRoster,resolveOutcome,effects}=input;
 const nextRoundsUsed=roundsUsed+1;
 if(!userTappedReveal && nextRoundsUsed<maxRounds)return {next:'HOLD',roundsUsed:nextRoundsUsed,locked:false};
 const {totalFp,tier}=resolveOutcome(resolvedRoster);
 const persisted=await effects.persistLock({roster:resolvedRoster,totalFp,tier});
 if(!persisted.ok)return {next:'HOLD',roundsUsed,locked:false};
 effects.telemetry('lineup_locked',{handId:persisted.handId});
 return {next:'REVEALING',roundsUsed:nextRoundsUsed,locked:true};
}
