import { describe, it, expect } from "vitest";
import { isRealName } from "../isRealName";

describe("isRealName", () => {
  it("rejects null/undefined/empty", () => {
    expect(isRealName(null)).toBe(false);
    expect(isRealName(undefined)).toBe(false);
    expect(isRealName("")).toBe(false);
    expect(isRealName("   ")).toBe(false);
  });

  it("rejects names under 2 chars", () => {
    expect(isRealName("a")).toBe(false);
    expect(isRealName(" b ")).toBe(false);
  });

  it("rejects pure-digit strings", () => {
    expect(isRealName("1234")).toBe(false);
    expect(isRealName("00000")).toBe(false);
  });

  it("rejects Player_/Guest_/User_ prefixes", () => {
    expect(isRealName("Player_8923")).toBe(false);
    expect(isRealName("player_42")).toBe(false);
    expect(isRealName("Guest_xyz")).toBe(false);
    expect(isRealName("USER_99")).toBe(false);
  });

  it("rejects names containing hex strings", () => {
    expect(isRealName("u_abc123def456")).toBe(false);
    expect(isRealName("user-deadbeef")).toBe(false);
  });

  it("accepts human-looking names", () => {
    expect(isRealName("Mike")).toBe(true);
    expect(isRealName("John T")).toBe(true);
    expect(isRealName("ShadowHoops")).toBe(true);
    expect(isRealName("Coach Z")).toBe(true);
  });

  it("accepts short numeric suffixes that aren't hex runs", () => {
    expect(isRealName("Mike22")).toBe(true);
    expect(isRealName("J23")).toBe(true);
  });
});
