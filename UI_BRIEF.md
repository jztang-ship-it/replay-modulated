# UI Polish Task Brief

## Context
ReplayMod is a fast-paced fantasy sports game. We have a functional dpolish before investor presentations.

## Current State
- Frontend: React + TypeScript in `/frontend/src`
- Main component: `AthleteCard.tsx` (player cards with flip animation)
- Working features: card flip, stats display, tier colors, MVP glow

## Task: Make AthleteCard Stunning
The card is functional but needs visual wow-factor:

### Design Goals
1. **Premium feel** - like opening a TCG booster pack
2. **Tier differentiation** - each tier (GRAY/PURPLE/ORANGE/RED) should be visually distinct
3. **Smooth animations** - card reveals, flips, hovers
4. **Modern aesthetic** - gradients, depth, shadows

### Specific Areas
- Card borders/frames per tier
- Background gradients
- Typography hierarchy
- Stat presentation on back of card
- Hover/interaction states
- Achievement badge styling

### Constraints
- Keep functionality intact (flip works, stats display correctly)
- Use Tailwind utility classes only (no custom CSS compiler)
- Maintain sport-agnostic design (no football-specific styling)

### Files to Focus On
- `frontend/src/components/AthleteCard.tsx` - main card component
- `frontend/src/components/RosterGrid.tsx` - card layout (if spacing needs adjustment)

## Running the App
```bash
cd frontend
npm run dev
# Opens at http://localhost:5173
```

## Testing
Click through game phases:
1. DRAFT - see projected stats
2. HOLD - lock/unlock cards  
3. RESULTS - see actual FP, flip cards to view detailed stats
