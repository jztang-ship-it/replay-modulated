// @vitest-environment jsdom
import React from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
vi.mock('@shared/analytics/analytics',()=>({track:vi.fn()}));
import {GameBar} from '../GameBar';
afterEach(cleanup);
it('cannot restore wallet, wagers or payouts through legacy props',()=>{
 render(<GameBar gameState="IDLE" balance={123456} totalFp={0} capMax={250} capUsed={0}
 lockedSalary={0} revealedSalary={0} betMultiplier={10} baseBet={10} onBetMultiplier={()=>{}}
 economyEnabled={true} showBetMultiplier={true} onAction={()=>{}} winTiers={[{label:'ROOKIE',minFp:0,color:'green',glow:'green'}]}
 legend={{tierRows:[{label:'LEGEND',score:'250+',payout:'20x',color:'red',bg:'black',border:'red'}],scoringRules:[],badges:[]}}/>);
 expect(document.body.textContent).not.toMatch(/123456|balance|wager|10X|20x|payout/i);
 fireEvent.click(screen.getByRole('button',{name:'i',exact:true}));
 expect(screen.getByRole('button',{name:'tiers',exact:false})).toBeTruthy();
 expect(document.body.textContent).not.toMatch(/123456|balance|wager|20x|payout/i);
});
