/**
 * shared/views/_persistLock.ts — bounded lineup-lock persist (build-phase B1 fix b).
 *
 * The round-machine controller (_roundMachine.ts) stays PURE: it awaits an
 * injected persistLock and gates the charge on its result. The timeout/bounding
 * lives HERE (off the pure module) so a slow/hung hand_log insert can never block
 * the REVEALING transition — and so it's runtime-testable without rendering GameView.
 *
 * Contract: the charge is gated on ok === true (record CONFIRMED before money).
 * A bounded-out or thrown write returns ok:false → the controller skips the charge
 * (safe, re-chargeable direction) but still reveals. The write promise is NOT
 * cancelled on timeout — it may land later; `reason` + the handId let that be
 * reconciled ("skip + row eventually landed" = under-charged-but-persisted).
 */
import type { PersistResult } from "./_roundMachine";

/** Revenue-vs-safety dial. A false timeout costs a legitimate charge (the
 *  safe-but-costly direction), so err LONG: a real insert confirms well under
 *  this, a genuine hang is still capped. Tune from entry_fee_skipped telemetry
 *  (reason:"timeout") once there's real data. */
export const PERSIST_TIMEOUT_MS = 2500;

/**
 * Run a persist write bounded by a timeout.
 * - write resolves before the bound → { ok:true }
 * - write still pending at the bound → { ok:false, reason:"timeout" } (write keeps running)
 * - write rejects → { ok:false, reason:"throw" }
 * Never throws.
 */
export async function boundedPersist(
  write: () => Promise<unknown>,
  handId: string,
  timeoutMs: number = PERSIST_TIMEOUT_MS,
): Promise<PersistResult> {
  try {
    const ok = await Promise.race<boolean>([
      write().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    return ok ? { ok: true, handId } : { ok: false, handId, reason: "timeout" };
  } catch {
    return { ok: false, handId, reason: "throw" };
  }
}
