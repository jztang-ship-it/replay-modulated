#!/usr/bin/env python3
"""
Generate ReplayIFS OG images at exactly 1200x630, no letterboxing.

Outputs:
  chooser/public/og-home.png        — INSTANT FANTASY
  chooser/public/og-basketball.png  — INSTANT NBA FANTASY
  chooser/public/og-baseball.png    — INSTANT MLB FANTASY

Layout per image:
  - Solid #070A12 background with subtle dot pattern
  - Left: ReplayIFS play-badge + wordmark
  - Vertical divider
  - Right: large white headline (auto-fit) + gold tagline
"""

import os
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630

BG = (7, 10, 18)            # #070A12
WHITE = (240, 242, 245)     # #F0F2F5
ORANGE = (255, 140, 30)     # play button
GOLD = (255, 177, 74)       # #FFB14A — tagline + accent

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "chooser", "public")

IMPACT = "/System/Library/Fonts/Supplemental/Impact.ttf"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ARIAL_NARROW_BOLD = "/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf"


def make_canvas() -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    # Subtle radial glow on right (gold accent), then dot pattern overlay.
    glow = Image.new("RGB", (W, H), BG)
    g = ImageDraw.Draw(glow)
    cx, cy = 1050, 320
    for r in range(620, 0, -20):
        # very subtle warm tint that fades to BG
        t = r / 620.0
        col = (
            int(BG[0] + (28 - BG[0]) * (1 - t) * 0.35),
            int(BG[1] + (22 - BG[1]) * (1 - t) * 0.35),
            int(BG[2] + (14 - BG[2]) * (1 - t) * 0.35),
        )
        g.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=70))
    img = Image.blend(img, glow, alpha=0.9)

    # Dot pattern, very dim, full bleed.
    pix = img.load()
    random.seed(7)
    step = 22
    for y in range(0, H, step):
        for x in range(0, W, step):
            ox = x + (random.randint(-1, 1))
            oy = y + (random.randint(-1, 1))
            if 0 <= ox < W and 0 <= oy < H:
                base = pix[ox, oy]
                lift = random.randint(10, 26)
                pix[ox, oy] = (
                    min(255, base[0] + lift),
                    min(255, base[1] + lift + 2),
                    min(255, base[2] + lift + 6),
                )
    return img


def draw_logo(img: Image.Image, cx: int) -> None:
    """Logo block — play-badge circle stacked over Replay/IFS wordmark.
    Renders into the image at horizontal center `cx`, vertically centered.
    """
    d = ImageDraw.Draw(img, "RGBA")
    badge_cy = 240
    r = 96

    # White outer ring
    d.ellipse((cx - r, badge_cy - r, cx + r, badge_cy + r),
              outline=WHITE, width=6)
    # Inner dim ring for depth
    d.ellipse((cx - r + 8, badge_cy - r + 8, cx + r - 8, badge_cy + r - 8),
              outline=(255, 255, 255, 40), width=1)

    # Orange play triangle
    tri_h = int(r * 1.05)
    tri_w = int(tri_h * 0.92)
    cx_t = cx + 6
    pts = [
        (cx_t - tri_w * 0.45, badge_cy - tri_h * 0.5),
        (cx_t - tri_w * 0.45, badge_cy + tri_h * 0.5),
        (cx_t + tri_w * 0.55, badge_cy),
    ]
    d.polygon(pts, fill=ORANGE)

    # Wordmark — "Replay" white over "IFS" gold, stacked, both Impact.
    f_word = ImageFont.truetype(IMPACT, 92)
    line1 = "Replay"
    line2 = "IFS"
    b1 = f_word.getbbox(line1)
    b2 = f_word.getbbox(line2)
    w1, h1 = b1[2] - b1[0], b1[3] - b1[1]
    w2, h2 = b2[2] - b2[0], b2[3] - b2[1]

    y1 = badge_cy + r + 30
    d.text((cx - w1 // 2 - b1[0], y1 - b1[1]),
           line1, font=f_word, fill=WHITE)
    y2 = y1 + h1 + 4
    d.text((cx - w2 // 2 - b2[0], y2 - b2[1]),
           line2, font=f_word, fill=GOLD)


def draw_divider(img: Image.Image, x: int) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    pad = 90
    d.line((x, pad, x, H - pad), fill=(255, 255, 255, 60), width=2)


def fit_font(text: str, path: str, max_w: int, start: int, min_size: int = 40) -> ImageFont.FreeTypeFont:
    size = start
    while size > min_size:
        f = ImageFont.truetype(path, size)
        b = f.getbbox(text)
        if (b[2] - b[0]) <= max_w:
            return f
        size -= 2
    return ImageFont.truetype(path, min_size)


def draw_text_block(img: Image.Image, headline_lines: list[str], tagline: str,
                    x_left: int, x_right: int) -> None:
    d = ImageDraw.Draw(img)
    max_w = x_right - x_left

    # Auto-fit each headline line independently, then take the smallest size
    # so all lines share one consistent font size.
    sizes = []
    for line in headline_lines:
        f = fit_font(line, IMPACT, max_w, start=170, min_size=80)
        sizes.append(f.size)
    headline_size = min(sizes)
    f_head = ImageFont.truetype(IMPACT, headline_size)

    # Compute total headline height (line-height ~0.95) and tagline height,
    # then vertically center the whole text block.
    line_metrics = [f_head.getbbox(t) for t in headline_lines]
    line_h = headline_size  # cap height-ish
    line_gap = int(headline_size * 0.05)
    total_head_h = line_h * len(headline_lines) + line_gap * (len(headline_lines) - 1)

    f_tag = ImageFont.truetype(ARIAL_BOLD, 38)
    tag_b = f_tag.getbbox(tagline)
    tag_h = tag_b[3] - tag_b[1]
    tag_gap = 32

    block_h = total_head_h + tag_gap + tag_h
    y_start = (H - block_h) // 2

    y = y_start
    for line in headline_lines:
        b = f_head.getbbox(line)
        d.text((x_left - b[0], y - b[1]), line, font=f_head, fill=WHITE)
        y += line_h + line_gap

    y = y_start + total_head_h + tag_gap
    d.text((x_left - tag_b[0], y - tag_b[1]), tagline, font=f_tag, fill=GOLD)


def render(headline_lines: list[str], tagline: str, out_name: str) -> str:
    img = make_canvas()
    draw_logo(img, cx=235)
    draw_divider(img, x=485)
    draw_text_block(img, headline_lines, tagline, x_left=525, x_right=1130)

    out_path = os.path.join(OUT_DIR, out_name)
    img.save(out_path, "PNG", optimize=True)
    return out_path


def main() -> None:
    targets = [
        (["INSTANT", "FANTASY"], "All fantasy. No waiting.", "og-home.png"),
        (["INSTANT NBA", "FANTASY"], "All fantasy. No waiting.", "og-basketball.png"),
        (["INSTANT MLB", "FANTASY"], "All fantasy. No waiting.", "og-baseball.png"),
    ]
    for headline_lines, tagline, name in targets:
        path = render(headline_lines, tagline, name)
        with Image.open(path) as im:
            print(f"wrote {path}  {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main()
