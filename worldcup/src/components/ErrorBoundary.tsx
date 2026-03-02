import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, color: "#EAF0FF", fontFamily: "monospace", background: "#070A12", minHeight: "100vh" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: "#FF6B6B" }}>Something went wrong</div>
          <pre style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "pre-wrap" }}>
            {this.state.error?.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
