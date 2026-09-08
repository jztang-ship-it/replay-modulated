/** Public diagnostics: never return raw SQL, credentials or database error details. */
export function isAuthoritySchemaMissing(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return ["PGRST205", "PGRST202", "42P01", "42703", "42883"].includes(code);
}
export function authorityUnavailable(error: unknown, fallback = "Authoritative game service unavailable") {
  return isAuthoritySchemaMissing(error)
    ? { code: "AUTHORITY_SCHEMA_MISSING", error: "Game database upgrade required. Contact the administrator." }
    : { code: "AUTHORITY_UNAVAILABLE", error: fallback };
}
