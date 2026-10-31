import os
from PIL import Image, ImageDraw, ImageFilter

SVG_CONTENT = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient -->
    <radialGradient id="bgGlow" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#1B2234"/>
      <stop offset="60%" stop-color="#0E121B"/>
      <stop offset="100%" stop-color="#07090D"/>
    </radialGradient>

    <!-- Border Glow Gradient -->
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#D4F63D"/>
      <stop offset="50%" stop-color="#3DF6D9"/>
      <stop offset="100%" stop-color="#007AFF"/>
    </linearGradient>

    <!-- Liquid Gradient -->
    <linearGradient id="liquidGrad" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#0066FF"/>
      <stop offset="45%" stop-color="#3DF6D9"/>
      <stop offset="100%" stop-color="#D4F63D"/>
    </linearGradient>

    <!-- Droplet Glow Gradient -->
    <radialGradient id="dropGrad" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="25%" stop-color="#E2FC5B"/>
      <stop offset="70%" stop-color="#D4F63D"/>
      <stop offset="100%" stop-color="#3DF6D9"/>
    </radialGradient>

    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>

    <filter id="dropGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="14" result="glow"/>
      <feComposite in="SourceGraphic" in2="glow" operator="over"/>
    </filter>
  </defs>

  <!-- Squircle Base -->
  <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#bgGlow)"/>
  <rect x="16" y="16" width="480" height="480" rx="112" fill="none" stroke="url(#borderGrad)" stroke-width="4.5" opacity="0.85"/>

  <!-- Top IoT Ultrasonic Pulses -->
  <path d="M 206 72 A 54 54 0 0 1 306 72" fill="none" stroke="#D4F63D" stroke-width="3" stroke-linecap="round" opacity="0.4"/>
  <path d="M 186 54 A 78 78 0 0 1 326 54" fill="none" stroke="#3DF6D9" stroke-width="3.5" stroke-linecap="round" opacity="0.6"/>
  <path d="M 166 36 A 104 104 0 0 1 346 36" fill="none" stroke="#D4F63D" stroke-width="4" stroke-linecap="round" filter="url(#neonGlow)"/>

  <!-- Sensor Cap -->
  <rect x="236" y="82" width="40" height="12" rx="4" fill="#3DF6D9" filter="url(#neonGlow)"/>

  <!-- Water Tank Cylinder Outer -->
  <rect x="126" y="98" width="260" height="340" rx="48" fill="#111520" stroke="rgba(255, 255, 255, 0.12)" stroke-width="3"/>
  <rect x="132" y="104" width="248" height="328" rx="42" fill="#0C0F17"/>

  <!-- Measurement Tick Marks -->
  <line x1="352" y1="140" x2="366" y2="140" stroke="#D4F63D" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <line x1="356" y1="190" x2="366" y2="190" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="352" y1="240" x2="366" y2="240" stroke="#3DF6D9" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <line x1="356" y1="290" x2="366" y2="290" stroke="rgba(255,255,255,0.3)" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="352" y1="340" x2="366" y2="340" stroke="#007AFF" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  <line x1="352" y1="390" x2="366" y2="390" stroke="rgba(255,255,255,0.4)" stroke-width="2.5" stroke-linecap="round"/>

  <!-- Liquid Fill inside Tank -->
  <g clip-path="url(#tankClip)">
    <clipPath id="tankClip">
      <rect x="132" y="104" width="248" height="328" rx="42"/>
    </clipPath>

    <!-- Liquid Body with Wave -->
    <path d="M 120 440 L 120 230 C 180 215, 220 245, 280 230 C 330 218, 360 226, 400 230 L 400 440 Z" fill="url(#liquidGrad)"/>

    <!-- Wave Surface Neon Line -->
    <path d="M 120 230 C 180 215, 220 245, 280 230 C 330 218, 360 226, 400 230" fill="none" stroke="#FFFFFF" stroke-width="3.5" filter="url(#neonGlow)"/>

    <!-- Ambient Glow beneath surface -->
    <ellipse cx="256" cy="330" rx="90" ry="60" fill="rgba(61, 246, 217, 0.25)" filter="url(#dropGlow)"/>
  </g>

  <!-- Hero Water Droplet Icon at Center -->
  <g filter="url(#dropGlow)" transform="translate(0, -6)">
    <!-- Droplet Body -->
    <path d="M 256 168 C 256 168, 204 246, 204 286 A 52 52 0 0 0 308 286 C 308 246, 256 168, 256 168 Z" fill="url(#dropGrad)"/>
    
    <!-- Specular Highlight -->
    <ellipse cx="240" cy="265" rx="10" ry="16" transform="rotate(-28 240 265)" fill="#FFFFFF" opacity="0.85"/>
    <circle cx="270" cy="295" r="5" fill="#FFFFFF" opacity="0.75"/>
  </g>

  <!-- Sparkle Accent Dot -->
  <circle cx="340" cy="116" r="4.5" fill="#D4F63D" filter="url(#neonGlow)"/>
</svg>
"""

def render_icon(size):
    # Render antialiased image using PIL
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    scale = size / 512.0

    # Draw rounded background
    draw = ImageDraw.Draw(img)
    corner_radius = int(112 * scale)
    pad = int(16 * scale)

    # Gradient background
    bg_img = Image.new("RGBA", (size, size), (7, 9, 13, 255))
    bg_draw = ImageDraw.Draw(bg_img)

    # Subtle radial gradient center
    cx, cy = size // 2, int(size * 0.3)
    max_r = int(size * 0.7)
    for r in range(max_r, 0, -2):
        factor = r / max_r
        # #1B2234 -> #07090D
        cr = int(27 * (1 - factor) + 7 * factor)
        cg = int(34 * (1 - factor) + 9 * factor)
        cb = int(52 * (1 - factor) + 13 * factor)
        bg_draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(cr, cg, cb, 255))

    # Mask to squircle
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=corner_radius, fill=255)
    img.paste(bg_img, (0, 0), mask)

    # Outer neon border
    border_draw = ImageDraw.Draw(img)
    border_w = max(1, int(4.5 * scale))
    border_draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=corner_radius, outline=(212, 246, 61, 220), width=border_w)

    # Tank body
    tx1, ty1 = int(126 * scale), int(98 * scale)
    tx2, ty2 = int(386 * scale), int(438 * scale)
    tank_r = int(48 * scale)

    tank_mask = Image.new("L", (size, size), 0)
    tank_mask_draw = ImageDraw.Draw(tank_mask)
    tank_mask_draw.rounded_rectangle([tx1, ty1, tx2, ty2], radius=tank_r, fill=255)

    # Tank liquid
    liquid_img = Image.new("RGBA", (size, size), (12, 15, 23, 255))
    l_draw = ImageDraw.Draw(liquid_img)

    water_top = int(230 * scale)
    # Gradient water from blue to lime
    for y in range(water_top, ty2 + 1):
        progress = (y - water_top) / max(1, ty2 - water_top)
        # 0: lime #D4F63D, 0.5: cyan #3DF6D9, 1.0: blue #0066FF
        if progress < 0.5:
            p2 = progress / 0.5
            cr = int(212 * (1 - p2) + 61 * p2)
            cg = int(246 * (1 - p2) + 246 * p2)
            cb = int(61 * (1 - p2) + 217 * p2)
        else:
            p2 = (progress - 0.5) / 0.5
            cr = int(61 * (1 - p2) + 0 * p2)
            cg = int(246 * (1 - p2) + 102 * p2)
            cb = int(217 * (1 - p2) + 255 * p2)
        l_draw.line([(tx1, y), (tx2, y)], fill=(cr, cg, cb, 255), width=1)

    # Wave line
    l_draw.line([(tx1, water_top), (tx2, water_top)], fill=(255, 255, 255, 240), width=max(1, int(3 * scale)))

    img.paste(liquid_img, (0, 0), tank_mask)

    # Tank outline
    tank_outline_draw = ImageDraw.Draw(img)
    tank_outline_draw.rounded_rectangle([tx1, ty1, tx2, ty2], radius=tank_r, outline=(255, 255, 255, 50), width=max(1, int(2.5 * scale)))

    # Ticks
    tick_x1 = int(352 * scale)
    tick_x2 = int(366 * scale)
    for ty, color, w in [
        (140, (212, 246, 61, 230), 3),
        (190, (255, 255, 255, 100), 2),
        (240, (61, 246, 217, 230), 3),
        (290, (255, 255, 255, 100), 2),
        (340, (0, 122, 255, 230), 3),
    ]:
        tank_outline_draw.line([(tick_x1, int(ty * scale)), (tick_x2, int(ty * scale))], fill=color, width=max(1, int(w * scale)))

    # Sensor cap
    sx1, sy1 = int(236 * scale), int(82 * scale)
    sx2, sy2 = int(276 * scale), int(94 * scale)
    tank_outline_draw.rounded_rectangle([sx1, sy1, sx2, sy2], radius=int(3 * scale), fill=(61, 246, 217, 255))

    # Center Hero Droplet
    drop_cx, drop_cy = int(256 * scale), int(270 * scale)
    dr = int(48 * scale)

    # Droplet circle base + triangle top
    drop_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d_draw = ImageDraw.Draw(drop_img)
    d_draw.ellipse([drop_cx - dr, drop_cy - dr, drop_cx + dr, drop_cy + dr], fill=(212, 246, 61, 255))
    top_y = int(164 * scale)
    d_draw.polygon([(drop_cx - dr + int(6 * scale), drop_cy), (drop_cx + dr - int(6 * scale), drop_cy), (drop_cx, top_y)], fill=(212, 246, 61, 255))

    # Droplet highlight
    d_draw.ellipse([drop_cx - int(16 * scale), drop_cy - int(10 * scale), drop_cx - int(4 * scale), drop_cy + int(14 * scale)], fill=(255, 255, 255, 220))

    img.paste(drop_img, (0, 0), drop_img)

    # Top Ultrasonic Sensor Pulses
    p_draw = ImageDraw.Draw(img)
    pw = max(1, int(3.5 * scale))
    p_draw.arc([int(186 * scale), int(36 * scale), int(326 * scale), int(106 * scale)], start=200, end=340, fill=(61, 246, 217, 200), width=pw)
    p_draw.arc([int(166 * scale), int(18 * scale), int(346 * scale), int(88 * scale)], start=200, end=340, fill=(212, 246, 61, 255), width=max(1, int(4 * scale)))

    return img

def main():
    root = "d:/projects/Smart Water Tank"

    # 1. Save master SVG to dashboard/public/favicon.svg
    fav_svg_path = os.path.join(root, "dashboard/public/favicon.svg")
    os.makedirs(os.path.dirname(fav_svg_path), exist_ok=True)
    with open(fav_svg_path, "w", encoding="utf-8") as f:
        f.write(SVG_CONTENT)
    print("Generated:", fav_svg_path)

    # Also save to mobile/assets/icon/app_icon.svg
    mobile_icon_svg = os.path.join(root, "mobile/assets/icon/app_icon.svg")
    os.makedirs(os.path.dirname(mobile_icon_svg), exist_ok=True)
    with open(mobile_icon_svg, "w", encoding="utf-8") as f:
        f.write(SVG_CONTENT)
    print("Generated:", mobile_icon_svg)

    # 2. Render PNG icons for Web Dashboard
    for name, s in [("favicon.png", 64), ("icon-192.png", 192), ("icon-512.png", 512)]:
        p = os.path.join(root, "dashboard/public", name)
        img = render_icon(s)
        img.save(p, "PNG")
        print(f"Generated Web Icon: {p} ({s}x{s})")

    # 3. Render Android mipmap launcher icons
    android_res = os.path.join(root, "mobile/android/app/src/main/res")
    android_sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, s in android_sizes.items():
        dir_path = os.path.join(android_res, folder)
        os.makedirs(dir_path, exist_ok=True)
        out_path = os.path.join(dir_path, "ic_launcher.png")
        img = render_icon(s)
        img.save(out_path, "PNG")
        print(f"Generated Android Icon: {out_path} ({s}x{s})")

    # High-res mobile master icon
    highres_mobile = os.path.join(root, "mobile/assets/icon/app_icon.png")
    img_512 = render_icon(512)
    img_512.save(highres_mobile, "PNG")
    print("Generated Master Mobile Icon:", highres_mobile)

if __name__ == "__main__":
    main()
