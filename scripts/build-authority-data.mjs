import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
const root=process.cwd();
for(const sport of ['basketball','baseball','football']) {
 const base=join(root,sport,'public','data');
 const sources=sport==='basketball'?readdirSync(join(base,'seasons')).filter(s=>/^\d{4}$/.test(s)).map(s=>join(base,'seasons',s)):[base];
 mkdirSync(join(root,'server-data',sport),{recursive:true});
 for(const src of sources){
  const players=JSON.parse(readFileSync(join(src,'players.json'),'utf8'));
  const logs=JSON.parse(readFileSync(join(src,sport==='basketball'?'gamelogs.json':'game-logs.json'),'utf8'));
  for(const season of new Set(players.map(p=>String(p.season)))){
   if(!/^\d{4}$/.test(season))throw new Error('Invalid catalog season');
   const data={players:players.filter(p=>String(p.season)===season),logs:logs.filter(l=>String(l.season)===season)};
   writeFileSync(join(root,'server-data',sport,season+'.json.gz'),gzipSync(JSON.stringify(data),{level:9}));
  }
 }
}
console.log('Built private compressed authority catalogs');
