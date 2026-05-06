/**
 * football/src/adapters/SportAdapter.ts
 *
 * Football sport adapter. Same shape as basketball + baseball: each sport
 * declares its own SportAdapter class, exports the class + a singleton.
 *
 * Currently extends the shared base with no overrides — Football uses
 * default behavior for displayPosition (identity: GK/DEF/MID/FWD pass
 * through unchanged), no record sources registered, no sound pack
 * registered. When Football gets its own audio + record data, register
 * them here the same way basketball and baseball do (registerRecordSources
 * + setSoundPack side-effect at module load).
 */
import { SportAdapter as SharedSportAdapter } from "@shared/adapters/SportAdapter";
import { FootballSportConfig } from "./footballConfig";

export class SportAdapter extends SharedSportAdapter {
  // Football overrides go here as feature parity work progresses.
  // Pattern reference: basketball/src/adapters/SportAdapter.ts.
}

export const sportAdapter = new SportAdapter(FootballSportConfig);
export default sportAdapter;
