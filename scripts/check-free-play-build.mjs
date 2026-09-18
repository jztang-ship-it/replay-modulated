import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const forbidden=[
 /Daily Bonus Pool/i,/Top 10 in each lane split the pool/i,/\/api\/bonus-pool/,
 /grant_coins/,/replaymod_balance/,/rewardCoins/,/calculatePayout/,
 /betMultiplier/,/entry_fee_committed/,/payout\s*:/,/coins (added|on submit)/i,
 /keep your coins/i,/Cash the hand/i,/money in the account/i,
];
export function assertFreePlayBundle(contents,label='bundle'){
 for(const rule of forbidden)if(rule.test(contents))throw new Error(`${label}: forbidden economy artifact ${rule}`);
}
export function checkFreePlayBuild(directory){
 let count=0;
 function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  const p=join(dir,entry.name);if(entry.isDirectory())walk(p);
  else if(/\.(js|html|css)$/.test(entry.name)){assertFreePlayBundle(readFileSync(p,'utf8'),p);count++;}
 }}
 walk(directory);if(!count)throw new Error('No build files to verify');
 console.log(`PASS: ${count} production files checked for economy code, endpoints and copy.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)checkFreePlayBuild(resolve(process.argv[2]||'dist'));
