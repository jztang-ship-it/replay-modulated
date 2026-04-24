/**
 * teamFlavor.ts — Team culture database for baseball commentary.
 * Keyed by UPPERCASE full team name (matches `opponent` field in gamelogs).
 */

export const TEAM_FLAVOR: Record<string, { identity: string; hype: string; cold: string; humor: string }> = {
  // ── AL East ─────────────────────────────────────────────────────────────
  "BALTIMORE ORIOLES": {
    identity: "Baltimore — the rebuild that actually worked, the farm system everyone tried to copy",
    hype: "Camden Yards got to feel it tonight. Birdland is back and it's earned.",
    cold: "Camden Yards stayed quiet. The Orioles gave them no reason.",
    humor: "The Orioles rebuild was textbook. The follow-through is where it gets interesting.",
  },
  "BOSTON RED SOX": {
    identity: "Boston — the Green Monster, the curse that ended, and a fan base that never forgets a trade",
    hype: "Fenway got loud tonight. The oldest park in the league still knows how to rock.",
    cold: "Fenway crowds are unforgiving. Tonight gave them material.",
    humor: "The Sox media cycle runs 24/7 and tonight just handed them content.",
  },
  "NEW YORK YANKEES": {
    identity: "New York — 27 rings, the most expensive payroll in sports, and the most scrutinized pinstripes anywhere",
    hype: "The Bronx delivered. Yankees baseball when it clicks is still the loudest thing in sports.",
    cold: "The Bronx crowd let them know. They always do.",
    humor: "Yankee Twitter has already drafted the George Steinbrenner ghost quote.",
  },
  "TAMPA BAY RAYS": {
    identity: "Tampa Bay — the smallest payroll, the sharpest analytics, and a plan that keeps beating the checkbook",
    hype: "The Trop lit up. The Rays keep making the math work.",
    cold: "Tropicana Field stayed quiet. Even the catwalks were bored.",
    humor: "The Rays just traded someone. It's a Tuesday. They're fine.",
  },
  "TORONTO BLUE JAYS": {
    identity: "Toronto — Canada's team, the only MLB franchise playing in a different country, carrying the whole North above the border",
    hype: "Rogers Centre got loud. The whole country showed up for this one.",
    cold: "Canada's team had a long night. The maple leaf hung lower.",
    humor: "The Blue Jays are Canada's team, which means Canadian media analyzes every at-bat twice.",
  },

  // ── AL Central ──────────────────────────────────────────────────────────
  "CHICAGO WHITE SOX": {
    identity: "Chicago's South Side — the 2005 ring, the long rebuilds, and a fan base that keeps showing up anyway",
    hype: "Rate Field got what it came for. South Side baseball has a pulse.",
    cold: "The Sox had a long night. The South Side has seen a lot of these.",
    humor: "The White Sox rebuild continues. Year six or seven, depending on how you count.",
  },
  "CLEVELAND GUARDIANS": {
    identity: "Cleveland — the longest title drought that ended in heartbreak, the new name, and the pitching factory",
    hype: "Progressive Field got loud. The Guardians are making the math work again.",
    cold: "Cleveland had a quiet night. The pitching carried; the bats didn't.",
    humor: "The Guardians' pitching depth is so deep they forget who's on the IL.",
  },
  "DETROIT TIGERS": {
    identity: "Detroit — Tiger Stadium memories, the Verlander-Cabrera era, and a rebuild that's starting to click",
    hype: "Comerica Park caught fire. Motor City baseball has something to say again.",
    cold: "Detroit had a long evening. Tiger faithful are used to the cold.",
    humor: "The Tigers are developing pitchers. Somewhere, Justin Verlander approves.",
  },
  "KANSAS CITY ROYALS": {
    identity: "Kansas City — Bo Jackson, George Brett, two World Series, and the small-market miracle of 2014-15",
    hype: "Kauffman Fountains are running. KC baseball when it hums is pure Americana.",
    cold: "Kauffman stayed quiet. The fountains didn't get a workout.",
    humor: "The Royals fan base has barbecue, opinions, and patience. In that order.",
  },
  "MINNESOTA TWINS": {
    identity: "Minnesota — Kirby Puckett, Kent Hrbek, and a franchise that keeps showing up quietly every year",
    hype: "Target Field got loud. Twins baseball in Minnesota summer is pure.",
    cold: "Target Field had a long night. The mosquitos were more active than the bats.",
    humor: "The Twins play .500 baseball with unreasonable consistency. Midwestern, really.",
  },

  // ── AL West ─────────────────────────────────────────────────────────────
  "HOUSTON ASTROS": {
    identity: "Houston — the 2017 asterisk, the sustained excellence since, and a fan base that stopped apologizing years ago",
    hype: "Minute Maid Park got loud. Houston keeps winning and keeps pretending to be surprised.",
    cold: "The Astros had a quiet evening. The group chat noticed.",
    humor: "The Astros are somehow still in contention. They will be next year too. Don't ask.",
  },
  "LOS ANGELES ANGELS": {
    identity: "Anaheim — Mike Trout's decade of being the best player nobody watched in October",
    hype: "Angel Stadium finally had a reason to stay loud past the 7th.",
    cold: "The Angels had a long night. October feels far away. It usually does.",
    humor: "Mike Trout's career is a cautionary tale about letting one guy carry a franchise. The franchise keeps letting it happen.",
  },
  "ATHLETICS": {
    identity: "The A's — Moneyball's birthplace, the green and gold history, and a franchise in transit",
    hype: "The A's got a win their fans will hold onto. They deserve one.",
    cold: "The A's had another long night. The rebuild is patient.",
    humor: "The Athletics are somewhere between cities. The fans are still there, though — they always are.",
  },
  "SEATTLE MARINERS": {
    identity: "Seattle — the longest active playoff drought in the big four, Edgar's statue, and the hope that never quits",
    hype: "T-Mobile Park got loud. Seattle baseball, when it works, is a genuine Pacific Northwest event.",
    cold: "Seattle stayed quiet. The Mariners fan patience is legendary for a reason.",
    humor: "Mariners fans have developed the specific zen of a people who've waited since 2001.",
  },
  "TEXAS RANGERS": {
    identity: "Arlington — the 2023 ring that ended decades of almost, Nolan Ryan ghosts, and the Texas swagger",
    hype: "Globe Life Field got loud. Texas baseball with a ring now plays different.",
    cold: "The Rangers had a long night. Even rings don't save every evening.",
    humor: "Rangers fans have a ring now. They're insufferable about it. As is the Texas way.",
  },

  // ── NL East ─────────────────────────────────────────────────────────────
  "ATLANTA BRAVES": {
    identity: "Atlanta — the Braves Way, the 2021 ring, and a farm system that keeps producing young stars on team-friendly deals",
    hype: "Truist Park did the chop. The Braves keep winning and keep looking like they'll do it next year.",
    cold: "Atlanta had a long evening. The chop was muted.",
    humor: "The Braves extend their own players before they're eligible. It's suspicious. It's also working.",
  },
  "MIAMI MARLINS": {
    identity: "Miami — two unlikely rings, endless fire sales, and a franchise that confuses everyone including itself",
    hype: "loanDepot Park finally had a reason to show up. Miami baseball is unpredictable in every direction.",
    cold: "The Marlins had a long night. The stadium was mostly empty. As is tradition.",
    humor: "The Marlins are about to trade everyone. Or not. With Miami you genuinely don't know.",
  },
  "NEW YORK METS": {
    identity: "Queens — Seaver and Piazza, the heartbreaks, the spending sprees, and the LFGM culture",
    hype: "Citi Field got loud. The Mets won one the fans will remember.",
    cold: "Queens had a long night. The Mets delivered what Mets fans expected.",
    humor: "The Mets just spent $300M on a closer. They'll miss the playoffs. It's a rhythm.",
  },
  "PHILADELPHIA PHILLIES": {
    identity: "Philadelphia — the most honest fan base in sports, two rings, and the bell that rings when Schwarber goes deep",
    hype: "Citizens Bank Park went red october. Philly baseball at its loudest is a specific thing.",
    cold: "Philadelphia had a long evening. The Phillies heard about it. They always do.",
    humor: "Phillies fans boo their own Hall of Famers. That's not a bug, it's the whole culture.",
  },
  "WASHINGTON NATIONALS": {
    identity: "DC — the 2019 ring, the rebuild, and the franchise quietly waiting for the next wave",
    hype: "Nationals Park got a reason to be loud. The rebuild is showing green shoots.",
    cold: "The Nationals had a long night. The rebuild is patient. So are the fans, mostly.",
    humor: "The Nationals won a ring, then traded everyone, then started over. Classic DC.",
  },

  // ── NL Central ──────────────────────────────────────────────────────────
  "CHICAGO CUBS": {
    identity: "Wrigley Field — 108 years of waiting, the 2016 ring that healed everything, and the ivy that keeps growing",
    hype: "Wrigley was electric. Cubs baseball in the Friendly Confines remains one of the great atmospheres in sports.",
    cold: "The Cubs had a long night. Wrigley stayed quiet. The bleacher creatures noticed.",
    humor: "Cubs fans remember 2016 the way pilgrims remember the Promised Land. They earned it.",
  },
  "CINCINNATI REDS": {
    identity: "Cincinnati — the Big Red Machine, the oldest team in baseball, and a small-market rebuild with real prospects",
    hype: "GABP got loud. Reds baseball in Cincinnati has a long memory and a loud one.",
    cold: "Great American Ball Park stayed quiet. The Reds had a long one.",
    humor: "The Reds have been around longer than baseball itself. They act like it, too.",
  },
  "MILWAUKEE BREWERS": {
    identity: "Milwaukee — the sausage race, Bernie sliding into the mug, and a small-market franchise that refuses to stop contending",
    hype: "American Family Field got the sausages running. Brewers baseball in its own goofy way is elite.",
    cold: "Milwaukee had a quiet night. Bernie stayed in his mug.",
    humor: "The Brewers keep making the playoffs on a small-market budget. Nobody can explain it, including them.",
  },
  "PITTSBURGH PIRATES": {
    identity: "Pittsburgh — PNC Park with the Clemente Bridge, the most beautiful stadium in baseball, and a rebuild that's beginning to look real",
    hype: "PNC Park got what it came for. The Pirates gave their fans a reason to stay through nine.",
    cold: "The Pirates had a long night. Pittsburgh's patience is being tested again.",
    humor: "The Pirates have the prettiest stadium in baseball. It hides a lot.",
  },
  "ST. LOUIS CARDINALS": {
    identity: "St. Louis — the Cardinal Way, 11 rings, and a fan base that won't let you forget a single one",
    hype: "Busch Stadium got loud. The Cardinals keep their standards and mostly keep meeting them.",
    cold: "St. Louis had a long evening. Cardinal fans don't hide disappointment — it's a code violation.",
    humor: "Cardinal fans invented the phrase 'baseball the right way.' They mean it. Everyone else rolls their eyes.",
  },

  // ── NL West ─────────────────────────────────────────────────────────────
  "ARIZONA DIAMONDBACKS": {
    identity: "Phoenix — the 2001 ring behind Schilling and Johnson, the 2023 pennant out of nowhere, and a fan base that shows up when it matters",
    hype: "Chase Field got its roof closed and its crowd loud. The D-backs ride again.",
    cold: "Arizona had a quiet night. The desert was quieter.",
    humor: "The Diamondbacks have two pennants and nobody outside Phoenix remembers either one. Phoenix remembers.",
  },
  "COLORADO ROCKIES": {
    identity: "Denver — Coors Field, the altitude, Blake Street Bombers memories, and a long wait for a real October",
    hype: "Coors Field got loud. The thin air cooperated. The Rockies didn't waste it.",
    cold: "Coors stayed quiet. Even the altitude couldn't help tonight.",
    humor: "The Rockies are a mile above sea level. Their road ERA feels like a mile deep.",
  },
  "LOS ANGELES DODGERS": {
    identity: "Los Angeles — the highest payroll, 2020 ring, Ohtani, Betts, and a fan base that expects October every year",
    hype: "Dodger Stadium was electric. When LA hums, it really hums.",
    cold: "Dodger Stadium had a long night. The Chavez Ravine sunsets were the only good thing.",
    humor: "The Dodgers signed Ohtani and Yamamoto in the same winter. They plan to do it again next year with different superstars.",
  },
  "SAN DIEGO PADRES": {
    identity: "San Diego — the friar, the brown uniforms, the big contracts, and the most fun October losses in baseball",
    hype: "Petco Park got loud. San Diego baseball when it's right is a specific vibe.",
    cold: "Petco stayed quiet. Friar Fred didn't get the memo.",
    humor: "The Padres spend like a big market and lose like a small one. San Diego, specifically, lives that duality.",
  },
  "SAN FRANCISCO GIANTS": {
    identity: "San Francisco — three rings in five years, the splash hits into McCovey Cove, and the fog that rolls in by the 7th",
    hype: "Oracle Park got loud and the fog stayed away. Giants baseball in the bay is its own weather system.",
    cold: "Oracle Park had a long night. The fog and the Giants were both cold.",
    humor: "The Giants fan base watched three rings in five years. They don't complain. Much.",
  },
};
