import { SportAdapter } from "@shared/adapters/SportAdapter";
import { WorldCupSportConfig } from "./worldcupConfig";

export const sportAdapter = new SportAdapter(WorldCupSportConfig);
export default sportAdapter;