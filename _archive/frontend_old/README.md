# iReplay Frontend

React-based UI for the iReplay instant fantasy sports game.

## Tech Stack

- React 18
- TypeScript
- TailwindCSS
- Framer Motion
- Vite

## Setup

```bash
cd frontend
npm install
npm run dev
```

## Structure

- `src/screens/` - Main game screens (StartScreen, DealScreen, HoldScreen, etc.)
- `src/components/` - Reusable components (PlayerCard, OdometerCounter, ProjectionMeter)
- `src/utils/` - Utility functions (tier calculations, engine adapters)
- `src/types/` - TypeScript type definitions

## Game Flow

1. **StartScreen** - Welcome screen with start button
2. **DealScreen** - Animated initial card deal
3. **HoldScreen** - Player selects which cards to hold
4. **FinalDrawScreen** - Replacement animation for non-held cards
5. **ResolutionScreen** - Slot-style reveal with FP counters and projection meters
6. **ResultScreen** - Win/loss feedback with play again option

## Features

- Strict GameState mirroring from backend
- Slot-machine style animations
- Tier visualization (Orange, Purple, Blue, Green, White)
- Odometer-style FP counter animations
- Projection vs Outcome meter visualization
- Responsive design with TailwindCSS

## Integration with Backend

The frontend currently uses mock data for MVP. To connect to the actual backend engine:

1. Update `src/utils/gameEngine.ts` to make API calls
2. Update `src/App.tsx` to use the engine adapter
3. Ensure backend exposes REST API endpoints matching the GameSession interface
