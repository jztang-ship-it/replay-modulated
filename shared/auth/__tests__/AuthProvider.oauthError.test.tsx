// @vitest-environment jsdom
/**
 * shared/auth/__tests__/AuthProvider.oauthError.test.tsx
 *
 * Phase 5b post-piece-2c (2026-05-30, Bug A supplementary): the
 * AuthProvider's URL-error scan surfaces post-OAuth callback failures
 * (Supabase returns `?error=...&error_description=...` when an OAuth
 * round-trip fails, e.g., identity collision). Prior to this fix,
 * those errors landed users on a silent signed-out state with no UI
 * feedback. The scan runs once on mount; URL params are stripped so a
 * refresh does not re-surface the error.
 *
 * Auth bootstrap itself isn't exercised here — the Supabase client is
 * the stub (no env vars in tests), so onAuthStateChange never fires
 * INITIAL_SESSION and signInAnonymously is unreachable. We're testing
 * the URL-scan effect in isolation, which is what the surfacing
 * feature owns.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useContext } from "react";
import { render, screen } from "@testing-library/react";
import { AuthContext, AuthProvider } from "../AuthProvider";

function Consumer() {
  const { oauthError, oauthErrorCode } = useContext(AuthContext);
  return (
    <>
      <div data-testid="oauth-error">{oauthError ?? "null"}</div>
      <div data-testid="oauth-error-code">{oauthErrorCode ?? "null"}</div>
    </>
  );
}

beforeEach(() => {
  // Reset URL to a clean path each test. Use jsdom's history API so
  // window.location reflects the new search string without a reload.
  window.history.replaceState({}, "", "/");
  try { sessionStorage.clear(); } catch { /* ignore */ }
});

describe("AuthProvider — oauthError surfacing (query string)", () => {
  it("oauthError is null when URL has no error params", () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId("oauth-error").textContent).toBe("null");
    expect(screen.getByTestId("oauth-error-code").textContent).toBe("null");
  });

  it("captures error_description when URL has ?error=...&error_description=...", () => {
    window.history.replaceState({}, "", "/?error=server_error&error_description=Identity+already+linked");
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId("oauth-error").textContent).toBe("Identity already linked");
    expect(screen.getByTestId("oauth-error-code").textContent).toBe("server_error");
  });

  it("falls back to error code when error_description is absent", () => {
    window.history.replaceState({}, "", "/?error=access_denied");
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId("oauth-error").textContent).toBe("access_denied");
    expect(screen.getByTestId("oauth-error-code").textContent).toBe("access_denied");
  });

  it("strips error params from URL after read (refresh-safe)", () => {
    window.history.replaceState({}, "", "/?error=server_error&error_description=Boom&debug=1");
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(window.location.search).not.toContain("error=");
    expect(window.location.search).not.toContain("error_description=");
    expect(window.location.search).toContain("debug=1");
  });
});

// Phase 5b post-piece-2c (2026-05-30, second iteration): hash scan added
// after live verification surfaced an identity_already_exists error in
// the URL HASH (Supabase implicit flow's standard), which the prior
// query-only scan missed.
describe("AuthProvider — oauthError surfacing (URL hash)", () => {
  it("captures error_description from URL hash (Supabase implicit-flow standard)", () => {
    window.history.replaceState(
      {},
      "",
      "/#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user",
    );
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId("oauth-error").textContent).toBe("Identity is already linked to another user");
    expect(screen.getByTestId("oauth-error-code").textContent).toBe("identity_already_exists");
  });

  it("error_code takes precedence over generic error for the code field", () => {
    // Supabase often returns both `error` (high-level type) and `error_code`
    // (specific identifier). The code field should pick the specific one.
    window.history.replaceState(
      {},
      "",
      "/#error=server_error&error_code=identity_already_exists&error_description=Boom",
    );
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId("oauth-error-code").textContent).toBe("identity_already_exists");
  });

  it("strips hash after read (refresh-safe)", () => {
    window.history.replaceState({}, "", "/basketball/#error=server_error&error_description=Boom");
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/basketball/");
  });

  it("hash takes precedence when both hash and query contain error", () => {
    window.history.replaceState(
      {},
      "",
      "/?error=query_error&error_description=From+query#error=hash_error&error_description=From+hash",
    );
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId("oauth-error").textContent).toBe("From hash");
  });
});
