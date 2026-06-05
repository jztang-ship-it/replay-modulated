// shared/components/shareIntents.ts
//
// Pure URL builders for the six share destinations the consolidated
// ChallengeSentConfirmation modal exposes (rev 2, 2026-06-05). No
// React, no side effects, no DOM access. Every interpolated value is
// `encodeURIComponent`'d at the boundary so a stray "&" or "#" in the
// caller's text/url can't corrupt the query string.
//
// Caller responsibility: pass the raw text and URL. Do NOT pre-encode —
// double-encoding is a real bug class on these intent endpoints.

function enc(value: string): string {
  return encodeURIComponent(value);
}

/** X / Twitter web-intent.
 *  https://twitter.com/intent/tweet?text=<text>&url=<url> */
export function twitterUrl(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
}

/** Facebook sharer. The endpoint accepts only `u=`; preview text is
 *  pulled from the destination page's OG tags server-side, not from a
 *  caller-supplied string.
 *  https://www.facebook.com/sharer/sharer.php?u=<url> */
export function facebookUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
}

/** Bluesky compose intent. Bluesky takes a single `text=` parameter —
 *  the URL is appended into the same text so it lands inline in the
 *  drafted post.
 *  https://bsky.app/intent/compose?text=<text url> */
export function blueskyUrl(text: string, url: string): string {
  const combined = text ? `${text} ${url}` : url;
  return `https://bsky.app/intent/compose?text=${enc(combined)}`;
}

/** WhatsApp click-to-chat. wa.me's `text=` is the whole message body;
 *  pack the URL into the same field so the recipient sees one message
 *  containing both the caption and the link.
 *  https://wa.me/?text=<text url> */
export function whatsAppUrl(text: string, url: string): string {
  const combined = text ? `${text} ${url}` : url;
  return `https://wa.me/?text=${enc(combined)}`;
}

/** Telegram share intent.
 *  https://t.me/share/url?url=<url>&text=<text> */
export function telegramUrl(text: string, url: string): string {
  return `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`;
}

/** Reddit submit. `title=` becomes the post title; the URL becomes the
 *  link post target (no body field — it's a link submission).
 *  https://www.reddit.com/submit?url=<url>&title=<text> */
export function redditUrl(text: string, url: string): string {
  return `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(text)}`;
}
