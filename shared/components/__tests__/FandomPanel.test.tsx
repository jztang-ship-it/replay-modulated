// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FandomPanel, fandomSummary } from '../FandomPanel';
import type { PlayerCard } from '../../types';
afterEach(cleanup);
const cards = [
 {cardId:'a',name:'Tim Duncan',actualFp:40,wasHeld:true,gameInfo:{date:'1998-04-04',opponent:'GSW'},statLine:{pts:20,reb:14,ast:1}},
 {cardId:'b',name:'Allen Iverson',actualFp:99,gameInfo:{date:'1998-05-01',opponent:'LAL'},statLine:{pts:50}},
] as unknown as PlayerCard[];
const thresholds: any = [{tier:'ROOKIE',minFP:0},{tier:'STARTER',minFP:100},{tier:'LEGEND',minFP:130}];
const props: any = {cards,thresholds,state:'REVEALING',heldIds:new Set(['a']),completedIds:new Set(['a']),lastCardId:'b',roundsUsed:3,maxRounds:3};
it('counts only completed performances, not hidden totals',()=>{
 expect(fandomSummary(cards,new Set(['a']),thresholds,false)).toMatchObject({score:40,remaining:1,next:{tier:'STARTER'}});
 render(<FandomPanel {...props}/>);
 expect(screen.getByText('60.0 to STARTER · 1 left')).toBeTruthy();
 expect(screen.queryByText(/99.0/)).toBeNull();
 expect(screen.queryByText(/50 PTS/)).toBeNull();
});
it('shows factual history only after that card completed',()=>{
 render(<FandomPanel {...props} lastCardId="a"/>);
 expect(screen.getByText('Tim Duncan · Backed · 40.0 FP')).toBeTruthy();
 expect(screen.getByText(/1998-04-04 · vs GSW · 20 PTS · 14 REB · 1 AST/)).toBeTruthy();
});
it('credits a drawn leader at results and handles the top tier',()=>{
 render(<FandomPanel {...props} state="RESULTS"/>);
 expect(screen.getByText('LEGEND reached')).toBeTruthy();
 expect(screen.getByText('Allen Iverson · Drawn · 99.0 FP · Hand leader')).toBeTruthy();
});
it('all-backed selection never promises a replacement',()=>{
 render(<FandomPanel {...props} state="HOLD" heldIds={new Set(['a','b'])}/>);
 expect(screen.getByText('All five backed · Reveal their nights')).toBeTruthy();
 expect(screen.queryByText(/spots.*draw/)).toBeNull();
});
it('a new hand clears score progress and private history',()=>{
 render(<FandomPanel {...props} state="IDLE" completedIds={new Set()}/>);
 expect(screen.getByText('Five players. Real historical nights.')).toBeTruthy();
 expect(screen.queryByText(/1998-04-04/)).toBeNull();
});

it('keeps selection to one instruction without tiers or a redundant backing list',()=>{
 const {container}=render(<FandomPanel {...props} state="HOLD"/>);
 expect(screen.getByText('1 player will be replaced')).toBeTruthy();
 expect(container.querySelector('[data-tier-reference]')).toBeNull();
 expect(screen.queryByText(/Backing Duncan/)).toBeNull();
});
it('shows immediate dealing feedback without a zero-score ladder',()=>{
 const {container}=render(<FandomPanel {...props} state="DEALING"/>);
 expect(screen.getByText('Dealing your five…')).toBeTruthy();
 expect(container.querySelector('[data-tier-reference]')).toBeNull();
});
it('does not shorten a basketball name to Jr.',()=>{
 render(<FandomPanel {...props} cards={[{...cards[0],name:'Michael Porter Jr.'}]} completedIds={new Set()} lastCardId={null}/>);
 expect(screen.getByText('Porter still to come')).toBeTruthy();
});
