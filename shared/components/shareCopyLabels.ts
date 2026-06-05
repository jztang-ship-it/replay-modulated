// shared/components/shareCopyLabels.ts
//
// Lifted-out presentation-chrome strings shared by the existing
// ChallengeSharePrompt (signed-in / synchronous share strip) and the
// new ChallengeSentConfirmation (post-OAuth-resume sender confirmation).
//
// No new copy is authored here. Each constant traces to a pre-existing
// inline literal in shared/components/. Centralizing the string ensures
// the two share surfaces never drift apart.
//
// Provenance:
//  - LINK_COPIED_LABEL: lifted from ChallengeSharePrompt.tsx:538 (the
//    CTA-label flip after navigator.share / clipboard fallback fires).
//  - COPY_LINK_LABEL: reuses the existing product label from
//    YourChallengesPanel.tsx:113 ("Copy link"). YourChallengesPanel's
//    own literal is left in place this PR (out of this lock's scope);
//    a future cleanup may import this constant from there too.

export const LINK_COPIED_LABEL = "Link Copied! ✓";
export const COPY_LINK_LABEL = "Copy link";

// Destination-button UI labels for ChallengeSentConfirmation's six-grid
// (rev 2, 2026-06-05). These are CHROME labels (brand names) — NOT share
// message copy. The shared message that goes out the door is passed
// through ChallengeSentConfirmation's shareHeadline prop as-is and is
// authored upstream (see lock §Strings).
export const SHARE_X_LABEL = "X";
export const SHARE_FACEBOOK_LABEL = "Facebook";
export const SHARE_BLUESKY_LABEL = "Bluesky";
export const SHARE_WHATSAPP_LABEL = "WhatsApp";
export const SHARE_TELEGRAM_LABEL = "Telegram";
export const SHARE_REDDIT_LABEL = "Reddit";
