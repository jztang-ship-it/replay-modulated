// @vitest-environment jsdom
/**
 * shared/components/__tests__/NameCaptureModal.test.tsx
 *
 * Phase 5b piece 1 auth-surface unification (2026-05-29, doc lock 2caa7a3):
 * the "anon" mode added in babd079 has been REMOVED per U3. Anonymous taps
 * route to RegisterModal in challenge context, not through NameCaptureModal.
 * The modal now serves signed-in users only — fresh + confirm flows only.
 *
 * Anon-mode tests deleted (5 tests). Fresh + confirm baseline regression
 * tests remain.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NameCaptureModal } from "../NameCaptureModal";

describe("NameCaptureModal — fresh + confirm modes (regression baseline)", () => {
  it("fresh mode renders an input + Continue button", () => {
    render(
      <NameCaptureModal
        isOpen
        mode="fresh"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("confirm mode shows the currentName + edit + primary buttons, no input", () => {
    render(
      <NameCaptureModal
        isOpen
        mode="confirm"
        currentName="Alice"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        confirmLabel="That's me"
        editLabel="Edit"
      />,
    );
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByRole("button", { name: /that's me/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("modal not rendered when isOpen is false", () => {
    const { container } = render(
      <NameCaptureModal
        isOpen={false}
        mode="fresh"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });
});
