/**
 * worldcup/src/adapters/SportAdapter.ts
 *
 * World Cup sport adapter. Same shape as basketball + baseball: each sport
 * declares its own SportAdapter class, exports the class + a singleton.
 *
 * Currently extends the shared base with no overrides — World Cup uses
 * default behavior for displayPosition (identity: GK/DEF/MID/FWD pass
 * through unchanged), no record sources registered, no sound pack
 * registered. When World Cup gets its own audio + record data, register
 * them here the same way basketball and baseball do (registerRecordSources
 * + setSoundPack side-effect at module load).
 */
import { SportAdapter as SharedSportAdapter } from "@shared/adapters/SportAdapter";
import { WorldCupSportConfig } from "./worldcupConfig";

export class SportAdapter extends SharedSportAdapter {
  // World Cup overrides go here when feature parity work begins.
  // Pattern reference: basketball/src/adapters/SportAdapter.ts.
}

export const sportAdapter = new SportAdapter(WorldCupSportConfig);
export default sportAdapter;
