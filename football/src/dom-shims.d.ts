// Type shim for @types/react-dom compatibility
// ReferrerPolicy and RequestDestination are defined in newer DOM libs
// This shim satisfies the compiler without requiring lib upgrade

type ReferrerPolicy =
  | "no-referrer" | "no-referrer-when-downgrade" | "origin"
  | "origin-when-cross-origin" | "same-origin" | "strict-origin"
  | "strict-origin-when-cross-origin" | "unsafe-url" | "";

type RequestDestination =
  | "" | "audio" | "audioworklet" | "document" | "embed" | "font"
  | "frame" | "iframe" | "image" | "manifest" | "object" | "paintworklet"
  | "report" | "script" | "sharedworker" | "style" | "track" | "video"
  | "worker" | "xslt";