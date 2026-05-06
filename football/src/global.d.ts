/// <reference lib="dom" />

// Polyfill missing DOM types for @types/react-dom compatibility
// These are standard browser types missing from the current TypeScript lib version

declare type ReferrerPolicy =
  | "" | "no-referrer" | "no-referrer-when-downgrade"
  | "origin" | "origin-when-cross-origin" | "same-origin"
  | "strict-origin" | "strict-origin-when-cross-origin" | "unsafe-url";

declare type RequestDestination =
  | "" | "audio" | "audioworklet" | "document" | "embed"
  | "font" | "frame" | "iframe" | "image" | "manifest"
  | "object" | "paintworklet" | "report" | "script"
  | "sharedworker" | "style" | "track" | "video" | "worker" | "xslt";