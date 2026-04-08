// Global JSX namespace shim for React 19.
// React 19's @types/react removed the global `JSX` namespace; intrinsic elements
// now live at `React.JSX.IntrinsicElements`. Shared components written before
// this migration still use `<div>`, `<span>`, etc., which resolve against the
// global. This ambient declaration re-creates the global by extending it from
// React's namespace, so every consumer gets correct intrinsic types regardless
// of file processing order. Must remain a `.d.ts` so it auto-loads at program start.

import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
  }
}

export {};
