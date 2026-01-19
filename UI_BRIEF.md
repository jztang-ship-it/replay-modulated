# UI Polish Task Brief for ChatGPT

## Quick Start
```bash
git clone <repo_url>
cd ReplayMod/frontend
npm install
npm run dev
# Open http://localhost:5173
```

## Your Mission
Make `AthleteCard.tsx` visually stunning for investor demo. The card works perfectly but needs premium aesthetic polish.

## Current State
- **Location**: `frontend/src/components/AthleteCard.tsx`
- **Functionality**: ✅ Perfect (flip works, stats display, phases work)
- **Visuals**: 🟡 Functional but needs wow-factor

## Design Goals
1. **Premium TCG feel** - Like opening a rare trading card
2. **Tier differentiation** - Each tier (ORANGE/PURPLE/BLUE/GREEN/WHITE) visually distinct
3. **Smooth animations** - Card reveals, flips, hovers feel polished
4. **Modern aesthetic** - Gradients, depth, shadows, typography

## Specific Improvements Needed

### Card Frame/Border
- Current: Simple colored border
- Want: Premium frame with depth, inner glow, tier-specific treatments

### Background Grnts  
- Current: Basic gradient from tier color
- Want: Multi-layered gradients, radial accents, shimmer effects

### Typography
- Current: Basic font hierarchy
- Want: Clear visual hierarchy, premium fonts (use Tailwind font utilities)

### Stat Display (Back of Card)
- Current: Simple list
- Want: Organized grid, visual icons/indicators, better spacing

### Animations
- Hover states with depth
- Flip animation polish (already works, maybe enhance)
- Card entrance animations

### Achievement Badges
- Current: Simple colored chips
- Want: Premium badge styling with icons/effects

## Constraints
- **Use Tailwind utilities only** (no custom CSS files)
- **Keep all functionality intact** (don't break flip, phase logic, etc.)
- **Sport-agnostic** (no football-specific imagery)
- **Test in all phases**: DRAFT (projected FP), HOLD (lock cards), RESULTS (flip cards)

## Testing Checklist
- [ ] Cards look premium in all 5 tiers
- [ ] Flip animation smooth and impressive
- [ ] Locked cards clearly marked
- [ ] MVP card stands out
- [ ] Stats readable on card back
- [ ] Hover states feel responsive
- [ ] Works on different screen sizes

## Files You'll Touch
- `frontend/src/components/AthleteCard.tsx` (main file)
- Possibly `frontend/src/components/RosterGrid.tsx` (if spacing needs adjustment)

## Reference
See `PROJECT.md` for full context on tier colors, game phases, and architecture.

Good luck! Make it beautiful! 🎨
