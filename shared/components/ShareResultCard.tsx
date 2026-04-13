import { useRef, useState } from 'react';
import type { PostGameResult } from './PostGameScreen';
import { headshotUrl } from '../utils/headshotUrl';

const TIER_COLORS: Record<string, string> = {
  LEGEND:       '#EF4444',
  MVP:        '#FB923C',
  ALL_STAR:   '#C084FC',
  STARTER:    '#F59E0B',
  ROOKIE:     '#22C55E',
  BUST:       '#E5E7EB',
  NONE:       '#444444',
};

const TIER_LABELS: Record<string, string> = {
  LEGEND:       'LEGEND',
  MVP:        'MVP',
  ALL_STAR:   'ALL-STAR',
  STARTER:    'STARTER',
  ROOKIE:     'ROOKIE',
  BUST:       'BUST',
  NONE:       '--',
};

const FF = "'Rajdhani', 'Arial Narrow', sans-serif";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/** roundRect with fallback for older iOS */
function safeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

export function ShareResultCard({ result }: { result: PostGameResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sharing, setSharing] = useState(false);
  const [showIOSNudge, setShowIOSNudge] = useState(false);

  const tierColor = TIER_COLORS[result.tier] ?? '#888';
  const tierLabel = TIER_LABELS[result.tier] ?? result.tier;

  async function generateAndShare() {
    if (sharing) return;
    setSharing(true);

    try {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;

      canvas.width  = 800;
      canvas.height = 1000;

      // ── Background ──────────────────────────────────────────────────────
      ctx.fillStyle = '#070A12';
      ctx.fillRect(0, 0, 800, 1000);

      const glow = ctx.createRadialGradient(400, 0, 0, 400, 0, 500);
      glow.addColorStop(0, `${tierColor}33`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 800, 1000);

      // ── Logo ────────────────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('REPLAYMOD', 400, 48);

      // ── Tier badge ──────────────────────────────────────────────────────
      ctx.fillStyle = tierColor;
      ctx.font = 'bold 52px Arial';
      ctx.fillText(tierLabel, 400, 130);

      // ── Total FP ────────────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 80px Arial';
      ctx.fillText(`${result.totalFP}`, 400, 220);

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '24px Arial';
      ctx.fillText('FANTASY POINTS', 400, 255);

      // ── Divider ─────────────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, 280);
      ctx.lineTo(740, 280);
      ctx.stroke();

      // ── Player cards (up to 6) ──────────────────────────────────────────
      const cards = result.rosterCards ?? [];
      const cols  = 3;
      const rows  = Math.ceil(Math.min(cards.length, 6) / cols);
      const cardW = 200;
      const cardH = 160;
      const startX = (800 - cols * cardW) / 2;
      const startY = 300;

      for (let i = 0; i < Math.min(cards.length, 6); i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * cardW;
        const y = startY + row * cardH;
        const card = cards[i];

        // Card bg
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath();
        safeRoundRect(ctx, x + 4, y + 4, cardW - 8, cardH - 8, 10);
        ctx.fill();

        // Headshot
        try {
          const img = await loadImage(headshotUrl(card.photoCode));
          ctx.save();
          ctx.beginPath();
          safeRoundRect(ctx, x + 4, y + 4, cardW - 8, cardH - 50, 8);
          ctx.clip();
          ctx.drawImage(img, x + 4, y + 4, cardW - 8, cardH - 50);
          ctx.restore();
        } catch {
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.beginPath();
          ctx.arc(x + cardW / 2, y + (cardH - 50) / 2, 36, 0, Math.PI * 2);
          ctx.fill();
        }

        // Name (last name only)
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        const shortName = card.name.split(' ').pop() ?? card.name;
        ctx.fillText(shortName, x + cardW / 2, y + cardH - 30);

        // FP
        ctx.fillStyle = tierColor;
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${card.actualFp.toFixed(1)}`, x + cardW / 2, y + cardH - 12);
      }

      // ── Best stamp ──────────────────────────────────────────────────────
      if (result.bestStamp) {
        const stampY = startY + rows * cardH + 24;
        const isHot = result.bestStamp.includes('HOT') || result.bestStamp.includes('FIRE');
        ctx.fillStyle = isHot ? '#FF6B35' : '#64B5F6';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          (isHot ? '🔥 ' : '❄️ ') + result.bestStamp,
          400, stampY,
        );
      }

      // ── Streak ──────────────────────────────────────────────────────────
      if (result.streak > 0) {
        ctx.fillStyle = '#FF8C00';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`🔥 ${result.streak} WIN STREAK`, 400, canvas.height - 100);
      }

      // ── CTA ─────────────────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '18px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('replay-mod.vercel.app', 400, canvas.height - 40);

      // ── Share ───────────────────────────────────────────────────────────
      canvas.toBlob(async (blob) => {
        if (!blob) { setSharing(false); return; }

        const file = new File([blob], 'replaymod-result.png', { type: 'image/png' });
        const shareText = `I just hit ${tierLabel} with ${result.totalFP} FP on ReplayMod! 🏀`;

        try {
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title: 'ReplayMod', text: shareText, files: [file] });
          } else if (navigator.share) {
            await navigator.share({ title: 'ReplayMod', text: shareText + ' replay-mod.vercel.app' });
          } else {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'replaymod-result.png';
            a.click();
            URL.revokeObjectURL(url);
          }
        } catch {
          // User cancelled — not an error
        }

        // iOS install nudge (one-time)
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        if (isIOS && !isStandalone && !localStorage.getItem('replaymod_ios_nudged')) {
          localStorage.setItem('replaymod_ios_nudged', 'true');
          setShowIOSNudge(true);
          setTimeout(() => setShowIOSNudge(false), 5000);
        }

        setSharing(false);
      }, 'image/png');

    } catch (err) {
      console.error('Share generation failed:', err);
      setSharing(false);
    }
  }

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <button
        onClick={generateAndShare}
        disabled={sharing}
        style={{
          width: '100%',
          background: sharing ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          padding: '16px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          cursor: sharing ? 'default' : 'pointer',
          transition: 'all 0.2s ease',
          fontFamily: FF,
        }}
      >
        <span style={{ fontSize: 20 }}>{sharing ? '⏳' : '📤'}</span>
        <span style={{
          fontSize: 16,
          fontWeight: 700,
          color: sharing ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          {sharing ? 'Generating...' : 'Share Result'}
        </span>
      </button>

      {showIOSNudge && (
        <div style={{
          marginTop: 8,
          padding: '10px 14px',
          background: 'rgba(255,215,0,0.08)',
          border: '1px solid rgba(255,215,0,0.25)',
          borderRadius: 10,
          fontSize: 12,
          color: 'rgba(255,255,255,0.6)',
          textAlign: 'center',
          lineHeight: 1.5,
        }}>
          💡 Tap <strong style={{ color: 'rgba(255,255,255,0.8)' }}>Share</strong> in Safari
          then <strong style={{ color: 'rgba(255,255,255,0.8)' }}>"Add to Home Screen"</strong>
          for instant access
        </div>
      )}
    </>
  );
}
