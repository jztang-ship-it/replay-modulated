# ReplayMod — /shared/ Layer 1

Sport-agnostic infrastructure. Every sport imports from here.

## Commands
```bash
# Extract World Cup data
node shared/extractors/StatsBombWorldCupAdapter.mjs

# Validate data
npx ts-node shared/validators/dataValidator.ts worldcup
npx ts-node shared/validators/dataValidator.ts basketball

# Simulate win tiers
npx ts-node shared/tools/runSimulator.ts basketball 10000
npx ts-node shared/tools/runSimulator.ts worldcup 10000
```
