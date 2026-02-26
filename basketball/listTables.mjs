import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hnhrpwwznzokkfagfumb.supabase.co',
  'sb_publishable_WSIZ6R2jgrSe-hXUCMtP8w_lETzweKx'
);

async function listTables() {
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');
  
  if (error) {
    // Try a direct query approach
    const tables = ['players', 'player', 'nba_players', 'athletes', 
                    'game_logs', 'gamelogs', 'games', 'logs', 'nba_games',
                    'stats', 'player_stats', 'roster'];
    
    console.log('Probing known table names...');
    for (const t of tables) {
      const { error: e } = await supabase.from(t).select('*').limit(1);
      if (!e) console.log('✅ FOUND:', t);
      else console.log('❌', t, '—', e.message);
    }
  } else {
    console.log('Tables:', data);
  }
}

listTables();
