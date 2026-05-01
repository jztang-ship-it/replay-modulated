/**
 * shared/components/ProfileScreen.tsx
 * Full-screen profile overlay — identity, ranks, personal bests.
 */

import { useEffect, useState } from "react";
import { getNickname, setNickname } from "@shared/utils/playerIdentity";
import { getMyReferralCode, buildShareUrl, shareReferralLink, getReferrerCode } from "@shared/utils/referral";
import { track } from "@shared/analytics/analytics";
import { InboxCard } from "@shared/inbox/InboxCard";
import { useAuth } from "@shared/auth/useAuth";

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

type Entry = { uid: string; nickname: string; score: number };

const RANK_METRICS: { id: string; label: string }[] = [
  { id: "hand_best", label: "Best Hand" },
  { id: "hand_avg",  label: "Avg Score" },
  { id: "money_won", label: "Most Won" },
];

interface Props {
  currentUid: string;
  sport: "basketball" | "baseball" | "worldcup";
  onClose: () => void;
  isAnonymous?: boolean;
  onSaveAccount?: () => void;
  onOpenFeedback: () => void;
}

export function ProfileScreen({ currentUid, sport, onClose, isAnonymous, onSaveAccount, onOpenFeedback }: Props) {
  const { user, signOut } = useAuth();
  const [nickname, setNick] = useState(() => getNickname());
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(nickname);
  const [ranks, setRanks] = useState<Record<string, { rank: number | null; score: number | null }>>({});
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    if (!confirm("Sign out? You'll keep playing as a guest until you sign in again.")) return;
    setSigningOut(true);
    const { error } = await signOut();
    setSigningOut(false);
    if (error) { alert("Sign out failed: " + error.message); return; }
    onClose();
  };

  // Fetch ranks for all three metrics
  useEffect(() => {
    for (const m of RANK_METRICS) {
      fetch(`/api/leaderboard?sport=${sport}&metric=${m.id}&scope=daily&limit=50`)
        .then(r => r.json())
        .then(data => {
          const entries: Entry[] = data.entries ?? [];
          const idx = entries.findIndex(e => e.uid === currentUid);
          setRanks(prev => ({
            ...prev,
            [m.id]: idx >= 0 ? { rank: idx + 1, score: entries[idx].score } : { rank: null, score: null },
          }));
        })
        .catch(() => {
          setRanks(prev => ({ ...prev, [m.id]: { rank: null, score: null } }));
        });
    }
  }, [currentUid, sport]);

  function handleSave() {
    const trimmed = editValue.trim();
    if (trimmed.length >= 2) {
      setNickname(trimmed);
      setNick(trimmed);
    }
    setEditing(false);
  }

  function formatScore(metricId: string, score: number): string {
    if (metricId === "hand_best") return `${score.toFixed(1)} FP`;
    if (metricId === "hand_avg") return `${(score / 10).toFixed(1)} avg`;
    return `${score.toLocaleString()} coins`;
  }

  // Personal bests from localStorage. rm_best_hand / rm_best_tier are
  // sport-scoped: basketball reads the unprefixed key (back-compat),
  // baseball reads `baseball_rm_best_hand` / `baseball_rm_best_tier`.
  // This keeps a fresh baseball player from inheriting basketball's all-
  // time bests as a phantom "extra win" before their first hand.
  // Hand count is intentionally cross-sport (analytics-grade total).
  const bestHandKey = sport === "basketball" ? "rm_best_hand" : `${sport}_rm_best_hand`;
  const bestTierKey = sport === "basketball" ? "rm_best_tier" : `${sport}_rm_best_tier`;
  const bestHand = localStorage.getItem(bestHandKey);
  const totalHands = localStorage.getItem("replaymod_hand_count");
  const bestTier = localStorage.getItem(bestTierKey);

  // Check if nickname looks auto-generated
  const namePrompted = !!localStorage.getItem("replaymod_name_prompted");
  const looksAutoGen = /_.{4,}$/.test(nickname) || /\d{4,}/.test(nickname);
  const showNameBanner = namePrompted && looksAutoGen && !editing;

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 12,
    textAlign: "center",
    flex: 1,
    minWidth: 0,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(180deg, #070A12 0%, #0A1020 60%, #070A12 100%)",
      color: "#EAF0FF",
      fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#EAF0FF", fontFamily: FF }}>
          PROFILE
        </span>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "5px 10px",
            color: "rgba(255,255,255,0.5)",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: FF,
          }}
        >
          Done
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Section 1 — Identity card */}
        <div
          onClick={() => { if (!editing) { setEditValue(nickname); setEditing(true); } }}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 16,
            cursor: editing ? "default" : "pointer",
          }}
        >
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                maxLength={20}
                autoFocus
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "#EAF0FF",
                  fontSize: 16,
                  fontWeight: 700,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleSave(); }}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8,
                    background: "#EAF0FF", color: "#070A12",
                    fontWeight: 800, fontSize: 13, border: "none", cursor: "pointer",
                  }}
                >
                  Save
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(false); }}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8,
                    background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)",
                    fontWeight: 700, fontSize: 13,
                    border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "rgba(255,215,0,0.15)",
                  border: "2px solid rgba(255,215,0,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 900, color: "#FFD700",
                  flexShrink: 0,
                }}>
                  {nickname.charAt(0).toUpperCase()}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "#EAF0FF" }}>{nickname}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Tap to edit</span>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 9, color: "rgba(255,255,255,0.2)" }}>
                ID: {currentUid.slice(0, 8)}
              </div>
            </>
          )}
        </div>

        {/* Inbox card */}
        <InboxCard
          userId={currentUid}
          isAnonymous={isAnonymous ?? true}
          onSaveAccount={onSaveAccount}
          onOpenFeedback={onOpenFeedback}
        />

        {/* Save Account — anonymous users only */}
        {isAnonymous && onSaveAccount && (
          <div
            onClick={onSaveAccount}
            style={{
              background: "linear-gradient(135deg, rgba(255,215,0,0.18), rgba(255,165,0,0.12))",
              border: "1px solid rgba(255,215,0,0.4)",
              borderRadius: 12,
              padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 12,
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 24 }}>🔒</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#FFD700" }}>Save Your Account</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                Keep your coins, streak, and leaderboard spot on any device
              </div>
            </div>
            <div style={{ fontSize: 18, color: "#FFD700" }}>›</div>
          </div>
        )}

        {/* Name banner */}
        {showNameBanner && (
          <div style={{
            background: "rgba(255,215,0,0.08)",
            border: "1px solid rgba(255,215,0,0.2)",
            borderRadius: 10,
            padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              Set a real name to appear on the leaderboard
            </span>
            <button
              onClick={() => { setEditValue(nickname); setEditing(true); }}
              style={{
                background: "#FFD700", color: "#070A12",
                fontWeight: 800, fontSize: 11, border: "none",
                borderRadius: 6, padding: "4px 10px", cursor: "pointer",
              }}
            >
              Set My Name
            </button>
          </div>
        )}

        {/* Section 2 — Today's standing */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
            TODAY'S STANDING
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {RANK_METRICS.map(m => {
              const r = ranks[m.id];
              return (
                <div key={m.id} style={cardStyle}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{m.label}</div>
                  <div style={{
                    fontSize: 18, fontWeight: 900,
                    color: r?.rank != null && r.rank <= 10 ? "#FFD700" : "rgba(255,255,255,0.35)",
                    marginBottom: 2,
                  }}>
                    {r?.rank != null ? `#${r.rank}` : "\u2014"}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                    {r?.score != null ? formatScore(m.id, r.score) : "\u2014"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section — Invite Friends */}
        <InviteFriendsSection />

        {/* Section 3 — Personal bests */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
            PERSONAL BESTS
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={cardStyle}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Best Hand</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: bestHand ? "#EAF0FF" : "rgba(255,255,255,0.35)" }}>
                {bestHand ? `${bestHand} FP` : "\u2014"}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Hands Played</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: totalHands ? "#EAF0FF" : "rgba(255,255,255,0.35)" }}>
                {totalHands ?? "\u2014"}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Best Tier</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: bestTier ? "#EAF0FF" : "rgba(255,255,255,0.35)" }}>
                {bestTier ? (bestTier === "ALL_STAR" ? "All-Star" : bestTier.charAt(0) + bestTier.slice(1).toLowerCase()) : "\u2014"}
              </div>
            </div>
          </div>
        </div>

        {/* Sign out \u2014 only for signed-in (non-anonymous) users */}
        {!isAnonymous && user && (
          <div style={{
            marginTop: 8, paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            {user.email && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                Signed in as {user.email}
              </div>
            )}
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8,
                padding: "8px 18px",
                color: "rgba(255,255,255,0.55)",
                fontSize: 12,
                fontWeight: 600,
                cursor: signingOut ? "wait" : "pointer",
                fontFamily: FF,
                letterSpacing: 0.5,
              }}
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Invite Friends ────────────────────────────────────────────────────────
// Shows the user's referral code, a share button (native share with clipboard
// fallback), and the referrer they were invited by (if any). Reward copy is
// intentionally "when they become a legit player" so users understand bot
// activity won't pay out. Actual legit-validation lives server-side.

const REFERRAL_REWARD_COINS = 300;
const REFERRAL_WELCOME_COINS = 100;

function InviteFriendsSection() {
  const [code] = useState(() => getMyReferralCode());
  const [referrer] = useState(() => getReferrerCode());
  const [shared, setShared] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    track("referral", "share_tapped", { code });
    const ok = await shareReferralLink();
    if (ok) {
      setShared(true);
      setCopied(!navigator.share); // if native share unavailable, we used clipboard
      setTimeout(() => { setShared(false); setCopied(false); }, 2500);
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      track("referral", "code_copied", { code });
      setTimeout(() => setCopied(false), 2000);
    } catch { /* no clipboard */ }
  }

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>
        INVITE FRIENDS
      </div>
      <div style={{
        background: "linear-gradient(135deg, rgba(255,215,0,0.08), rgba(192,132,252,0.06))",
        border: "1px solid rgba(255,215,0,0.2)",
        borderRadius: 14,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.4 }}>
          Share your code. When a friend joins and becomes a legit player, you both get coins —
          <span style={{ color: "#FFD700", fontWeight: 700 }}> {REFERRAL_REWARD_COINS} </span>
          for you,
          <span style={{ color: "#FFD700", fontWeight: 700 }}> {REFERRAL_WELCOME_COINS} </span>
          welcome for them.
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          {/* Code chip (tap to copy) */}
          <button
            onClick={handleCopyCode}
            style={{
              flex: 1,
              background: "rgba(255,215,0,0.12)",
              border: "1px solid rgba(255,215,0,0.3)",
              borderRadius: 10,
              padding: "10px 14px",
              color: "#FFD700",
              fontFamily: FF,
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: 3,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            {copied ? "COPIED ✓" : code}
          </button>
          {/* Share button */}
          <button
            onClick={handleShare}
            style={{
              background: "#FFD700",
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              color: "#070A12",
              fontFamily: FF,
              fontSize: 13,
              fontWeight: 900,
              letterSpacing: "0.1em",
              cursor: "pointer",
            }}
          >
            {shared ? "SHARED" : "SHARE"}
          </button>
        </div>

        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
          Legit means: played at least 10 hands across 2 distinct days. Bots don't qualify.
        </div>

        {referrer && (
          <div style={{
            marginTop: 4,
            paddingTop: 10,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11,
            color: "rgba(255,255,255,0.5)",
          }}>
            You were invited by <span style={{ color: "#FFD700", fontWeight: 700 }}>{referrer}</span>.
            Welcome bonus pending until you hit the legit threshold.
          </div>
        )}

        {/* Share URL hint (for debug/visibility) */}
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", wordBreak: "break-all" }}>
          {buildShareUrl()}
        </div>
      </div>
    </div>
  );
}
