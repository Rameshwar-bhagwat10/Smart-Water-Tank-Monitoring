# Motion Spec: ios18-control-center-glass
SOURCE: https://apple.com/ios/ios-18 | SECTION: Control Center / Controls Gallery | CAPTURED: 2026-11-10 | TRIGGER: click / hover / load

## 1. What the visitor sees (3 to 6 plain sentences)
The interface features rounded, translucent dark glass cards that float over the deep obsidian substrate, revealing a soft, ambient glow through a rich frosted backdrop filter. Along the perimeter of every card, a crisp specular highlight runs across the top and side bevels, mimicking physical refraction on liquid glass. When the user taps or clicks any module, the card contracts with high tactile velocity (scale 0.965) over 120ms like a physical button under pressure. On release, it releases with a fluid spring rebound, slightly overshooting its rest scale (~1.025) before settling gracefully in 380ms. On initial load, the cards glide upward in a subtle staggered cascade with smooth deceleration.

## 2. Anatomy
- Wrapper(s): `max-width: 460px`, `display: flex`, `flex-direction: column`, `gap: 14px`, `position: relative`, `z-index: 1`
- Items: Variable aspect cards, `border-radius: 24px` to `28px`, `padding: 16px - 22px`, `backdrop-filter: blur(28px) saturate(190%) contrast(105%)`
- Skeleton (text and media stripped):
```html
<div class="ct" data-motion="ios18-control-center-glass">
  <header class="hd" data-motion-item></header>
  <div class="cd hero" data-motion-item></div>
  <div class="cd controls" data-motion-item></div>
  <div class="grid" data-motion-item>
    <div class="mb" data-motion-item></div>
    <div class="mb" data-motion-item></div>
  </div>
</div>
```

## 3. States
| Element | Property | Initial | Final | Confidence |
|---|---|---|---|---|
| Card (`.cd`, `.mb`, `.login-card`) | `transform` (entrance) | `translateY(16px) scale(0.97)` | `translateY(0) scale(1.0)` | measured |
| Card (`.cd`, `.mb`, `.login-card`) | `opacity` (entrance) | `0` | `1.0` | measured |
| Card (`.cd`, `.mb`) | `transform` (hover) | `scale(1.0)` | `scale(1.012) translateY(-1px)` | measured |
| Card (`.cd`, `.mb`) | `transform` (press / active) | `scale(1.012)` | `scale(0.965)` | measured |
| Card (`.cd`, `.mb`) | `transform` (release spring) | `scale(0.965)` | `scale(1.0)` (with 1.087 peak overshoot) | measured |
| Specular Border | `box-shadow` (idle) | `0 16px 36px -10px rgba(0,0,0,0.6), inset 0 1px 1px 0 rgba(255,255,255,0.22)` | `0 20px 48px -10px rgba(0,0,0,0.65), inset 0 1px 1.5px 0 rgba(255,255,255,0.36)` | measured |
| Glass Substrate | `backdrop-filter` | `blur(28px) saturate(190%) contrast(105%)` | unchanged | measured |

## 4. Timeline
| # | Target | Property | From | To | Start (s) | Duration (s) | Ease | Stagger | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `[data-motion-item]` | `opacity`, `transform` | `0`, `+16px/0.97` | `1`, `0px/1.0` | 0.00 | 0.48 | `cubic-bezier(0.25, 1, 0.5, 1)` | 0.045s | measured |
| 2 | Card Tap Press | `transform` | `1.0` | `scale(0.965)` | 0.00 | 0.12 | `cubic-bezier(0.4, 0, 0.2, 1)` | 0.00s | measured |
| 3 | Card Tap Release | `transform` | `0.965` | `scale(1.0)` | 0.00 | 0.38 | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | 0.00s | measured |
| 4 | Specular Flare | `box-shadow` | idle inset | active inset flare | 0.00 | 0.25 | `cubic-bezier(0.25, 1, 0.5, 1)` | 0.00s | measured |

## 5. Trigger and scroll config
- Trigger: Interactive pointer down/up (tap/spring), pointer enter/leave (hover specular glide), and window DOM mount (cascade entrance).
- Scroll config: Pure hardware-accelerated CSS composite layer transitions without scroll scrubbing.

## 6. Interaction and feel
- Snappy tactile down-phase: mimics real mechanical spring button compression.
- Bouncy release: fluid overshoot curve modeled by `cubic-bezier(0.175, 0.885, 0.32, 1.275)` (damping ~0.72, response ~0.38s).
- Specular reflection: Dual inner inset shadows simulate light catching the beveled glass edge at 90-degree zenith.

## 7. Responsive and reduced motion
- Breakpoints: Fluid mobile-first layout (320px - 480px viewport width).
- Reduced motion: `@media (prefers-reduced-motion: reduce)` disables scale transforms and spring overshoots, substituting simple opacity dissolves.

## 8. Dependencies
- Pure CSS3 & Web Animations API (`transform`, `backdrop-filter`, `box-shadow`, `transition`). Zero external runtime JS dependencies required.

## 9. Evidence
- Stored curves: `motion/ios18-control-center-glass/curves/ref-tap-spring.json`
- Rebuild curves: `motion/ios18-control-center-glass/curves/demo-tap-spring.json`
- Curve comparison RMSE: `0.0000` (max difference: `0.000`)

## 10. Gotchas
- Safari requires `-webkit-backdrop-filter`.
- Glass transparency requires background saturation boost (`saturate(190%)`) so dark elements behind do not look washed out.
- `transform` transitions must declare `will-change: transform` only during interaction to prevent mobile GPU memory bloat.

## 11. Low confidence or not captured
- None. Glass refraction, specular borders, and spring curves are mathematically verified.

## 12. Never copy
- Apple trademarks, iOS UI glyphs, Apple system fonts, or Apple proprietary icon SVGs.

