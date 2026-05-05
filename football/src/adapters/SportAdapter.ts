/**
 * football/src/adapters/SportAdapter.ts
 *
 * Football sport adapter. Same shape as basketball + baseball: each sport
 * declares its own SportAdapter class, exports the class + a singleton.
 *
 * Position-specific FP scaling is config-driven via `positionMultipliers`
 * on FootballSportConfig (read by the shared SportAdapter base class).
 * Football sets GK: 4.0 to bring keeper FP totals into the same range as
 * outfield positions; see footballConfig.ts for the rationale.
 *
 * Pattern reference: basketball/src/adapters/SportAdapter.ts.
 */
import { SportAdapter as SharedSportAdapter } from "@shared/adapters/SportAdapter";
import { FootballSportConfig } from "./footballConfig";

export class SportAdapter extends SharedSportAdapter {
  // Football overrides go here as feature parity work progresses.
}

export const sportAdapter = new SportAdapter(FootballSportConfig);
export default sportAdapter;
