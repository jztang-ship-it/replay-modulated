#!/usr/bin/env ts-node
import { Simulator } from './Simulator';
import { FootballDemoSportConfig } from '../../sports/footballDemo';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  const numRuns = parseInt(process.argv[2] || '10000', 10);
  
  console.log('🎰 ReplayMod Game Economy Simulator');
  console.log(`Sport: Football (EPL Demo)`);
  console.log(`Running ${numRuns.toLocaleString()} simulations...\n`);
  
  // Load data directly from correct path
  const dataDir = path.join(process.cwd(), 'data', 'football', 'processed-epl');
  const playersPath = path.join(dataDir, 'players.json');
  const logsPath = path.join(dataDir, 'game-logs.json');
  
  const players = JSON.parse(fs.readFileSync(playersPath, 'utf8'));
  const gameLogs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  
  console.log(`Loaded ${players.length.toLocaleString()} players`);
  console.log(`Loaded ${gameLogs.length.toLocaleString()}ame logs\n`);
  
  const simulator = new Simulator(FootballDemoSportConfig, gameLogs, players, 6);
  
  const startTime = Date.now();
  const results = await simulator.runSimulations(numRuns);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`\n✅ Completed in ${elapsed}s`);
  
  const summary = simulator.analyzeSummary(results);
  simulator.printSummary(summary);
  simulator.analyzePositions(results);
}

main().catch(console.error);
