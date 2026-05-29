// @vitest-environment jsdom
/**
 * shared/components/__tests__/NameCaptureModal.test.tsx
 *
 * Phase 5b piece 1 (2026-05-28, doc lock 3da7f02): contract-lock on the
 * three modal modes. R2 added "anon" mode; this file locks its render
 * shape AND the regression-prevention shape for fresh + confirm modes
 * (which had no test coverage before — the anon work is the right
 * occasion to add baseline assertions).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NameCaptureModal } from "../NameCaptureModal";

describe("NameCaptureModal — anon mode (R2 piece 1)", () => {
  it("renders sign-up and sign-in CTAs, no name input", () => {
    render(
      <NameCaptureModal
        isOpen
        mode="anon"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onSignUp={vi.fn()}
        onSignIn={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /sign up/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("fires onSignUp when the primary CTA is tapped", () => {
    const onSignUp = vi.fn();
    render(
      <NameCaptureModal
        isOpen
        mode="anon"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onSignUp={onSignUp}
        onSignIn={vi.fn()}
      />,
    );
    screen.getByRole("button", { name: /sign up/i }).click();
    expect(onSignUp).toHaveBeenCalledTimes(1);
  });

  it("fires onSignIn when the secondary CTA is tapped", () => {
    const onSignIn = vi.fn();
    render(
      <NameCaptureModal
        isOpen
        mode="anon"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onSignUp={vi.fn()}
        onSignIn={onSignIn}
      />,
    );
    screen.getByRole("button", { name: /sign in/i }).click();
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("renders the caller-provided anonHeading copy", () => {
    render(
      <NameCaptureModal
        isOpen
        mode="anon"
        anonHeading="Custom anon heading"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onSignUp={vi.fn()}
        onSignIn={vi.fn()}
      />,
    );
    expect(screen.getByText("Custom anon heading")).toBeTruthy();
  });

  it("close × still calls onCancel from anon mode", () => {
    const onCancel = vi.fn();
    render(
      <NameCaptureModal
        isOpen
        mode="anon"
        onSubmit={vi.fn()}
        onCancel={onCancel}
        onSignUp={vi.fn()}
        onSignIn={vi.fn()}
      />,
    );
    screen.getByRole("button", { name: /cancel/i }).click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("NameCaptureModal — fresh + confirm modes (regression baseline)", () => {
  it("fresh mode renders an input and no sign-up/sign-in CTAs", () => {
    render(
      <NameCaptureModal
        isOpen
        mode="fresh"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^sign up$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^sign in$/i })).toBeNull();
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
        mode="anon"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onSignUp={vi.fn()}
        onSignIn={vi.fn()}
      />,
    );
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });
});
