/**
 * shared/components/ErrorBoundary.tsx
 * LAYER 1: Sport-agnostic React error boundary.
 *
 * Uses basketball's fuller implementation (reload button, centered layout).
 * All sports import from "@shared/components/ErrorBoundary".
 */

import { Component, type ReactNode } from "react";
import { captureError } from "@shared/lib/sentry";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State, any> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[ReplayMod] Uncaught error:", error, info);
    captureError(error, { reactInfo: info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: "100vw", height: "100vh",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#070A12", color: "#EAF0FF",
          fontFamily: "'Inter', system-ui, sans-serif",
          gap: 16, padding: 24, boxSizing: "border-box",
        }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Something went wrong</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center", maxWidth: 300 }}>
            {this.state.error?.message ?? "Unexpected error"}
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              marginTop: 8, padding: "12px 24px", borderRadius: 12, border: "none",
              background: "linear-gradient(180deg, #FFB14A 0%, #FF7A2F 100%)",
              color: "#EAF0FF", fontWeight: 900, fontSize: 14,
              letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}