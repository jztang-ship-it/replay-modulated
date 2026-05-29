// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { deriveDisplayName } from "../deriveDisplayName";
import type { User } from "@supabase/supabase-js";

function makeUser(over: Partial<User> = {}): User {
  return {
    id: "u1",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01",
    ...over,
  } as User;
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe("deriveDisplayName fallback chain", () => {
  it("prefers user_metadata.full_name", () => {
    const u = makeUser({
      email: "alice@example.com",
      user_metadata: { full_name: "Alice Wonder", name: "Alice W", picture: "..." },
    });
    expect(deriveDisplayName(u)).toBe("Alice Wonder");
  });

  it("falls back to user_metadata.name when full_name absent", () => {
    const u = makeUser({
      email: "alice@example.com",
      user_metadata: { name: "Alice W" },
    });
    expect(deriveDisplayName(u)).toBe("Alice W");
  });

  it("falls back to email local-part when no metadata names present", () => {
    const u = makeUser({
      email: "alice.cooper@example.com",
      user_metadata: {},
    });
    expect(deriveDisplayName(u)).toBe("alice.cooper");
  });

  it("falls back to getNickname() placeholder when nothing else is available", () => {
    const u = makeUser({
      email: undefined,
      user_metadata: {},
    });
    const out = deriveDisplayName(u);
    // The auto-mint pattern matches `<Adjective><Noun>_<digits>`.
    expect(out).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+_\d{4}$/);
  });

  it("trims whitespace from user_metadata strings", () => {
    const u = makeUser({
      user_metadata: { full_name: "  Spaced Name  " },
    });
    expect(deriveDisplayName(u)).toBe("Spaced Name");
  });

  it("ignores empty-string metadata and falls through", () => {
    const u = makeUser({
      email: "bob@example.com",
      user_metadata: { full_name: "", name: "  " },
    });
    expect(deriveDisplayName(u)).toBe("bob");
  });

  it("returns empty string when user is null", () => {
    expect(deriveDisplayName(null)).toBe("");
  });
});
