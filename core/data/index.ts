export type { DataProvider } from "./DataProvider";
export { LocalJsonProvider } from "./LocalJsonProvider";
export { LocalDataProvider } from "./providers/LocalDataProvider";

// NOTE:
// We intentionally do NOT import basketball JSON assets here.
// Those files may not exist yet, and hard imports break `tsc`.
// Add them back later when you actually ship basketball.
