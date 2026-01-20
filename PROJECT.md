Project complete · MDCopyReplayMod - Modular Instant Fantasy Sports Game
🎯 Project Overview (Sport-Agnostic)
ReplayMod is a modular instant fantasy sports platform that delivers fast-paced fantasy gaming using historical player statistics. Unlike traditional season-long fantasy leagues, ReplayMod offers:

Instant gratification - Complete games in minutes, not months
Historical accuracy - Real player performance data drives outcomes
Strategic depth - Draft, hold, and redraw mechanics create engaging decisions
Modular design - Easily swap between sports (football, basketball, baseball, etc.)

Core Gameplay Loop (Universal Across All Sports)

Draft - Get dealt a roster of player cards within a budget
Strategize - Choose which cards to "hold" (lock in place)
Redraw - Replace unlocked cards with new options
Resolve - See actual historical performance results
Score - Earn points and achievements based on player outcomes


🏗️ Three-Layer Modular Architecture
Layer 1: Core Engines 🧠 (Sport-Agnostic)
Location: /core/engine/
These engines work for ANY sport - they handle universal game logic without knowing if it's football, basketball, or baseball.
Engine Files:

FantasyEngine.ts - Main game coordinator
LineupGenerationEngine.ts - Builds valid rosters within constraints
ResolutionEngine.ts - Calculates final scores and rankings
AchievementEngine.ts - Awards badges based on performance
ValidationEngine.ts - Enforces roster and budget rules
ProjectionEngine.ts - Generates predicted scores
SalaryEngine.ts - Handles player pricing logic
StateMachineEngine.ts - Manages game phases (Deal → Hold → Redraw → Results)
RandomEngine.ts - Seeded randomness for fair gameplay
GameLogFilterEngine.ts - Queries historical performance data

Key Principle: These engines receive configuration objects that define sport-specific rules. They never hard-code values like "6 players" or "$180 cap".

Layer 2: Sport Configurations ⚽🏀⚾ (Pluggable)
Location: /core/sports/
Each sport has its own config file that tells Layer 1 HOW to operate for that sport.
Current Implementation: Football
File: core/sports/football.ts
Football-Specific Rules:
typescript{
  rosterSize: 6,
  salaryCap: { min: 172, max: 180 },
  positions: ["GK", "DE", "MD", "FW"],
  positionRequirements: {
    GK: { min: 1, max: 1 },
    DEF: { min: 1 },
    MD: { min: 1 },
    FW: { min: 1 }
  },
  scoringRules: {
    goals: 10,
    assists: 6,
    saves: 1,
    cleanSheet: 4,
    // ... etc
  },
  tierColors: ["ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"],
  minPlayingTime: 20 // minutes
}
Future Sports (Examples):
Basketball (basketball.ts - can add later):
typescript{
  rosterSize: 8,
  salaryCap: { min: 45000, max: 50000 },
  positions: ["PG", "SG", "SF", "PF", "C"],
  scoringRules: {
    points: 1,
    rebounds: 1.2,
    assists: 1.5,
    // ... etc
  }
}
Baseball (baseball.ts):
typescript{
  rosterSize: 9,
  salaryCap: { min: 35000, max: 40000 },
  positions: ["P", "C", "1B", "2B", "3B", "SS", "OF"],
  // ... etc
}

Layer 3: User Interface 🎨 (React Frontend)
Location: /ui/
The UI displays cards, animations, and results - it works with ANY sport by reading the active config.
Key Files:

ui/src/ui/GameView.tsx - Main card game interface
ui/src/ui/engine/engineAdapter.ts - Bridge to core engines
ui/src/ui/engine/types.ts - TypeScript type definitions

UI adapts to sport: Card colors, position labels, scoring displays all come from the active sport config.

📁 Complete Project Structure
ReplayMod/
├── PROJECT.md                       ← This documentation
├── package.json                     ← Root dependencies
├── tsconfig.json                    ← TypeScript config
│
├── core/                            ← LAYER 1 + 2 (Backend)
│   │
│   ├── engine/                      ← Layer 1: Sport-agnostic engines
│   │   ├── FantasyEngine.ts
│   │   ├── LineupGenerationEngine.ts
│   │   ├── ResolutionEngine.ts
│   │   ├── AchievementEngine.ts
│   │   ├── ValidationEngine.ts
│   │   ├── ProjectionEngine.ts
│   │   ├── SalaryEngine.ts
│   │   ├── StateMachineEngine.ts
│   │   ├── RandomEngine.ts
│   │   ├── GameLogFilterEngine.ts
│   │   └── index.ts
│   │
│   ├── sports/                      ← Layer 2: Sport-specific configs
│   │   ├── football.ts              ✅ ACTIVE (EPL football)
│   │   ├── footballDemo.ts          ← Demo/testing config
│   │   ├── footballObjectiveScoring.ts
│   │   ├── index.ts
│   │   └── achievements/
│   │       └── footballAchievements.ts
│   │   
│   │   # Future sports (not yet implemented):
│   │   # ├── basketball.ts
│   │   # ├── baseball.ts
│   │   # └── hockey.ts
│   │
│   ├── data/                        ← Data providers & storage
│   │   ├── DataProvider.ts          ← Abstract data interface
│   │   ├── LocalJsonProvider.ts     ← JSON file data source
│   │   ├── schema.ts                ← Data structure definitions
│   │   ├── index.ts
│   │   │
│   │   ├── adapters/                ← Data transformation logic
│   │   ├── providers/               ← Additional data sources
│   │   │
│   │   └── football/                ← Football-specific data
│   │       └── processed-epl/       ← English Premier League stats
│   │           ├── players.json     (140KB - player metadata)
│   │           └── game-logs.json   (107MB - historical performances) ⚠️
│   │
│   ├── models/                      ← Core type definitions
│   │   └── index.ts
│   │
│   ├── utils/                       ← Helper utilities
│   │   ├── stats.ts                 ← Statistical calculations
│   │   └── seed.ts                  ← Random seed generation
│   │
│   └── index.ts                     ← Main backend export
│
└── ui/                              ← LAYER 3 (Frontend - React)
    ├── src/
    │   ├── main.tsx                 ← App entry point
    │   ├── App.tsx                  ← Root component
    │   ├── App.css
    │   ├── index.css                ← Tailwind CSS imports
    │   │
    │   └── ui/                      ← Game UI components
    │       ├── GameView.tsx         ← 🎴 MAIN CARD GAME INTERFACE
    │       │
    │       ├── components/          ← Reusable UI components
    │       │   └── (empty - can add shared components)
    │       │
    │       └── engine/              ← Frontend-backend bridge
    │           ├── engineAdapter.ts ← Calls core engines
    │           └── types.ts         ← Frontend type definitions
    │
    ├── public/
    │   ├── data/                    ← Frontend data copy (for browser)
    │   │   ├── players.json         (368KB)
    │   │   └── game-logs.json       (42MB)
    │   └── (other static assets)
    │
    ├── package.json                 ← UI dependencies
    ├── vite.config.ts               ← Vite build configuration
    ├── tailwind.config.js           ← Tailwind CSS configuration ⚠️
    ├── tsconfig.json                ← TypeScript config
    ├── tsconfig.app.json
    ├── tsconfig.node.json
    ├── eslint.config.js
    └── index.html                   ← HTML entry point

🚨 CURRENT ISSUE
Problem: Cards Not Displaying Visually
What we see:

Plain text rendering: "Total FP", "67.4", player names, positions, FP scores
No visual card styling, borders, gradients, or colors

What we expect:

Beautiful colored cards with gradient backgrounds
Tier-based border colors (orange, purple, blue, green)
Hover effects and animations
Lock indicators (yellow ring)
MVP badges (purple ring)

Screenshot Evidence: User provided image showing plain text instead of styled cards
Root Cause (Suspected): Tailwind CSS not compiling or not configured properly

🔧 Tech Stack
Frontend

Framework: React 19 + TypeScript
Build Tool: Vite (fast dev server & bundler)
Styling: Tailwind CSS v3+ (utility-first CSS framework)
State Management: React hooks (useState, useEffect, useMemo)
UI Patterns: Component composition, render props

Backend (Core Engines)

Runtime: TypeScript Node.js
Data Format: JSON (local file-based for now)
Architecture: Functional + OOP hybrid
Testing: (To be added)

Data

Source: Historical player statistics (EPL 2022-2025 seasons)
Format: JSON game logs (player performance by match)
Size: ~107MB core data, ~42MB UI copy


🎨 Visual Design System
Card Tier Colors (Football-Specific Example)
Defined in core/sports/football.ts and rendered by ui/src/ui/GameView.tsx:
TierPrice RangeTailwind ClassesBorder ColorGradientORANGE$35-45border-orange-500🟠 Orangefrom-orange-900/40PURPLE$20-35border-purple-500🟣 Purplefrom-purple-900/40BLUE$10-20border-blue-500🔵 Bluefrom-blue-900/40GREEN$5-15border-green-500🟢 Greenfrom-green-900/40WHITEDefaultborder-slate-600⚪ Graybg-slate-800
Card States

Normal: Base tier colors
Locked/Held: ring-4 ring-yellow-400 (yellow outline glow)
MVP (Top Scorer): ring-4 ring-purple-500 (purple outline glow)
Hover: hover:scale-105 (slight zoom effect)

Win Tier Colors (Results Screen)
ScoreTierColorTailwind Class600+ FPLEGENDARY🌸 Fuchsiatext-fuchsia-500 + pulse animation500+ FPEPIC🟣 Purpletext-purple-500 + pulse400+ FPVICTORY🟡 Yellowtext-yellow-400 + pulse300+ FPPROFIT🟢 Greentext-green-400 + pulse250+ FPPUSH🔵 Bluetext-blue-400 + pulse<250 FPLOSS⚪ Graytext-slate-500 (no animation)

⚙️ Current Sport Configuration: Football (EPL)
Roster Rules

Size: 6 players exactly
Salary Cap: $172 min, $180 max
Positions: GK (Goalkeeper), DE (Defender), MD (Midfielder), FW (Forward)
Position Requirements:

Exactly 1 GK
At least 1 DE
At least 1 MD
At least 1 FW


Eligibility: Players must have played 20+ minutes in the game

Scoring System (Fantasy Points)
Goals: 10 pts
Assists: 6 pts
Shots on Target: 1 pt
Key Passes: 1 pt
Tackles Won: 1 pt
Interceptions: 1 pt
Saves (GK): 1 pt
Clean Sheet: 4 pts
Minutes Played: 0.02 pts per minute (max 1.8 for 90 min)

Penalties:
Yellow Card: -1 pt
Red Card: -3 pts
Goals Conceded: -1 pt
Achievement Badges
Displayed on cards during results phase:
AchievementTriggerBadgeHat Trick3+ goals🎩Brace2 goals⚡Goal1 goal⚽Maestro3+ assists🎯Creator2 assists🔑The Wall8+ saves🧤Fortress5+ saves🛡️Clean Sheet0 goals conceded🚫Perfect GamePositive contributions, no cards💎

📦 File Management & Zipping
❌ ALWAYS EXCLUDE (Makes Zips Huge):
node_modules/                              # Dependencies (100+ MB)
dist/ or build/                            # Build outputs
.git/                                      # Git history
core/data/football/raw/                    # Raw unprocessed data (340+ MB)
core/data/football/processed-epl/game-logs.json   # (107 MB)
ui/public/data/game-logs.json              # (42 MB)
**/*.backup.json                           # Backup files
ui/node_modules/                           # UI dependencies
✅ ALWAYS INCLUDE (Essential Code):
core/engine/                               # All engine files
core/sports/                               # Sport configurations
core/models/                               # Type definitions
core/utils/                                # Utilities
ui/src/                                    # All UI source code
package.json (both root and ui/)           # Dependencies list
tsconfig.json files                        # TypeScript configs
PROJECT.md                                 # This documentation!
💡 Quick Zip Command (Excludes Heavy Files):
bashcd ~/ReplayMod
zip -r ReplayMod-code-only.zip \
  core/engine/ \
  core/sports/ \
  core/models/ \
  core/utils/ \
  core/data/*.ts \
  ui/src/ \
  ui/public/ \
  -x "*/node_modules/*" "*/dist/*" "*/.git/*" "*.json" "game-logs.json"
Result: <5 MB (instead of 120+ MB)

🐛 Debugging Guide
Issue: Cards Not Showing (Current)
Step 1: Verify Tailwind CSS Configuration
bashcd ~/ReplayMod/ui
cat tailwind.config.js
Check for:
jsexport default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",  // ← Must include .tsx files!
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
Step 2: Verify Tailwind Import
bashcat ui/src/index.css
Must contain:
css@tailwind base;
@tailwind components;
@tailwind utilities;
Step 3: Test Build Process
bashcd ~/ReplayMod/ui
npm run dev
Open browser DevTools (F12):

Console tab: Look for errors
Network tab: Check if CSS is loading
Elements tab: Inspect a card - are Tailwind classes applied?

Step 4: Verify Data Loading
In browser Network tab:

/data/players.json should return 200 OK
/data/game-logs.json should return 200 OK
If 404: Data files missing from ui/public/data/

Step 5: Check React Component Rendering
In React DevTools:

Is <GameView> component mounted?
Does cards state have data? (should be array of 6 objects)
Are <SimpleCard> components receiving card prop?


📝 Update History
🔄 Update: Jan 18, 2026 - Major Reorganization ✅
Actions Completed:

✅ Renamed project: REPLAY-MODULATED → ReplayMod (easier to type!)
✅ Restructured folders:

src/ → core/ (backend engines + sport configs)
apps/replay-ui/ → ui/ (frontend React app)


✅ Removed duplicate nested folders (core/ui, ui/apps, ui/replay-ui)
✅ Deleted basketball files (not using yet, can add later)
✅ Deleted sandbox/experimental files (past that phase)
✅ Removed backup files (*.backup.json)
✅ Kept only processed EPL data (deleted raw data to save space)
✅ Created comprehensive PROJECT.md documentation

New Clean Structure:
ReplayMod/
├── core/      (Backend: engines + sport configs)
├── ui/        (Frontend: React + Tailwind)
└── PROJECT.md (This file)
Current Status: 🟡 Structure clean - Now debugging card display issue
Next Steps:

Check Tailwind CSS configuration in ui/tailwind.config.js
Verify CSS imports in ui/src/index.css
Test dev server and inspect rendered HTML
Fix styling so cards render with gradients/colors


🆘 Quick Context for New Conversations
Starting a new Claude chat? Copy/paste this:
I'm working on ReplayMod - a modular instant fantasy sports game.
I've attached PROJECT.md which has full project context.

Current issue: Cards in GameView.tsx are rendering as plain text 
instead of styled gradient cards with colored borders. Need to debug 
Tailwind CSS setup.

Project structure:
- core/engine/ = Sport-agnostic game engines (Layer 1)
- core/sports/ = Sport-specific configs like football.ts (Layer 2)  
- ui/ = React frontend with Vite + Tailwind (Layer 3)

Key files:
- ui/src/ui/GameView.tsx (main card UI)
- ui/src/ui/engine/engineAdapter.ts (bridge to core)
- ui/tailwind.config.js (styling config - suspected issue)

🎯 Long-Term Roadmap
Phase 1: Core Football Experience ✅ (Current)

 Build sport-agnostic engine architecture
 Implement football config and scoring
 Create card-based UI with React
 Fix card styling (Tailwind CSS) ← CURRENT
 Add animations and transitions
 Test and polish football gameplay

Phase 2: Multi-Sport Expansion

 Add basketball configuration
 Add baseball configuration
 Create sport-switching UI
 Unified achievement system across sports

Phase 3: Backend & Persistence

 User accounts and authentication
 Save game history
 Leaderboards
 Real-time multiplayer

Phase 4: Advanced Features

 Live data integration (real-time stats)
 Bracket tournaments
 Social features (share results)
 Mobile apps (iOS/Android)


Last Updated: January 18, 2026
Project Status: 🟡 Active Development - Debugging UI Styling
Location: /Users/john/ReplayMod/
Developer: John
## Recent Progress (Jan 19, 2026)

### Frontend
- ✅ Completed AthleteCard component with flip animation
- ✅ Front: player photo, stats, tier, salary, projected/actual FP
- ✅ Back: detailed stat breakdown
- ✅ Multi-card flip state (cards stay flipped independently)
- ✅ MVP glow effect, achievement badges
- ✅ Phase-aware UI (DRAFT vs RESULTS)

### Backend
- ✅ Built game economy simulator (10k runs in 43s)
- ✅ Simulation results: 6% win rate (needs tuning)
- ✅ Suggested thresholds: 22/29/36/44 FP for better economy
- ✅ Sport-agnostic architecture maintained

### Next: UI Polish with ChatGPT
Focus on making AthleteCard visually impressive for demo:
- Color schemes, gradients, shadows
- Smooth animations
- Tier visual differentiation
- Overall aesthetic polish
