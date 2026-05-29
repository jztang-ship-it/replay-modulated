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
  const { oauthError } = useContext(AuthContext);
  return <div data-testid="oauth-error">{oauthError ?? "null"}</div>;
}

beforeEach(() => {
  // Reset URL to a clean path each test. Use jsdom's history API so
  // window.location reflects the new search string without a reload.
  window.history.replaceState({}, "", "/");
});

describe("AuthProvider — oauthError surfacing", () => {
  it("oauthError is null when URL has no error params", () => {
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId("oauth-error").textContent).toBe("null");
  });

  it("captures error_description when URL has ?error=...&error_description=...", () => {
    window.history.replaceState({}, "", "/?error=server_error&error_description=Identity+already+linked");
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId("oauth-error").textContent).toBe("Identity already linked");
  });

  it("falls back to error code when error_description is absent", () => {
    window.history.replaceState({}, "", "/?error=access_denied");
    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId("oauth-error").textContent).toBe("access_denied");
  });

  it("strips error params from URL after read (refresh-safe)", () => {
    window.history.replaceState({}, "", "/?error=server_error&error_description=Boom&debug=1");
    render(<AuthProvider><Consumer /></AuthProvider>);
    // error params gone; other params preserved.
    expect(window.location.search).not.toContain("error=");
    expect(window.location.search).not.toContain("error_description=");
    expect(window.location.search).toContain("debug=1");
  });
});
