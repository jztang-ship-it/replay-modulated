import { readFileSync } from 'fs';

const players = JSON.parse(readFileSync('./public/data/players.json', 'utf8'));
const logs    = JSON.parse(readFileSync('./public/data/game-logs.json', 'utf8'));

// Check LeBron
const lebron = players.find(p => p.name === 'LeBron James');
console.log('LeBron player:', lebron);

const lebronLogs = logs.filter(l => l.basePlayerId === lebron?.id);
console.log(`LeBron logs: ${lebronLogs.length}`);
console.log('Sample log:', JSON.stringify(lebronLogs[0], null, 2));

// Check what season values exist in logs
const seasons = [...new Set(logs.map(l => l.season))];
console.log('Log seasons:', seasons);

// Check what season values exist in players
const playerSeasons = [...new Set(players.map(p => p.season))];
console.log('Player seasons:', playerSeasons);
