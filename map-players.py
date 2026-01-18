import json
import requests
import re
import unicodedata
from difflib import SequenceMatcher

def normalize(name):
    """Lowercase, strip accents/punctuation, collapse whitespace."""
    if not name:
        return ""
    name = str(name).lower().replace('-', ' ')
    name = unicodedata.normalize('NFKD', name)
    name = "".join([c for c in name if not unicodedata.combining(c)])
    name = re.sub(r'[^\w\s]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio() if a and b else 0.0


def best_fuzzy_match(local_name: str, candidates: dict, min_score: float = 0.86):
    """Return (code, score) for the best fuzzy match from candidates{name->code}."""
    best_code, best_score = None, 0.0
    for cand_name, code in candidates.items():
        score = similarity(local_name, cand_name)
        if score > best_score:
            best_code, best_score = code, score
    if best_score >= min_score:
        return best_code, best_score
    return None, best_score

# Load local players
try:
    with open('core/data/football/processed-epl/players.json', 'r') as f:
        local_players = json.load(f)
except Exception as e:
    print(f"File Error: {e}")
    exit()

print("Fetching FPL data...")
fpl_data = requests.get('https://fantasy.premierleague.com/api/bootstrap-static/').json()
fpl_elements = fpl_data['elements']

# Build a smarter lookup map: multiple keys -> same code
fpl_lookup = {}
for p in fpl_elements:
    full = normalize(f"{p['first_name']} {p['second_name']}")
    web = normalize(p['web_name'])
    fpl_lookup[full] = p['code']
    fpl_lookup[web] = p['code']

    # Extra keys to improve match rate
    fpl_lookup[normalize(p['second_name'])] = p['code']

matches = 0
fuzzy_matches = 0
for player in local_players:
    local_name = normalize(player['name'])
    
    # Check for direct match or partial overlap
    # 1) Exact key lookup
    if local_name in fpl_lookup:
        player['photoCode'] = fpl_lookup[local_name]
        matches += 1
        continue

    # 2) Containment (handles middle names)
    hit = None
    for fpl_name, code in fpl_lookup.items():
        if fpl_name and (fpl_name in local_name or local_name in fpl_name):
            hit = code
            break
    if hit is not None:
        player['photoCode'] = hit
        matches += 1
        continue

    # 3) Fuzzy fallback
    code, score = best_fuzzy_match(local_name, fpl_lookup, min_score=0.86)
    if code is not None:
        player['photoCode'] = code
        matches += 1
        fuzzy_matches += 1

print(f"Match Rate: {matches} / {len(local_players)}")
print(f"(Fuzzy matched: {fuzzy_matches})")

with open('core/data/football/processed-epl/players.json', 'w') as f:
    json.dump(local_players, f, indent=2)

# Also sync into UI season-cards players.json (if present)
try:
    with open('ui/public/data/players.json', 'r') as f:
        ui_players = json.load(f)

    core_map = {p['id']: p.get('photoCode') for p in local_players if p.get('photoCode')}
    synced = 0
    for p in ui_players:
        base_id = str(p.get('basePlayerId') or p.get('id') or '').split('-')[0]
        if base_id in core_map:
            p['photoCode'] = core_map[base_id]
            synced += 1

    with open('ui/public/data/players.json', 'w') as f:
        json.dump(ui_players, f, indent=2)

    print(f"Synced photoCode into ui/public/data/players.json for {synced} players")
except Exception as e:
    print(f"UI sync skipped: {e}")

print("Done. Restart your server.")