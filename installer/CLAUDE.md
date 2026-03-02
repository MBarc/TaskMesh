# Installer — Design & Build Guide

## Single source of truth

`server/`, `client/`, and `ai-service/` are **shared** between the Docker deployment and this installer. Never diverge them.

| File | Rule |
|---|---|
| `server/prisma/schema.prisma` | Always `provider = "postgresql"`. The installer's `build.ps1` patches the **dist copy** to `sqlite` — the source file is never touched. |
| `server/src/index.ts` | The `NODE_ENV === 'production'` check already handles static file serving for the installer. No installer-specific changes needed. |
| `server/package.json` | `start:windows` script is additive — Docker ignores it. |
| `client/` | Identical build for both targets. Docker puts it behind nginx; installer serves it from Express. |

**To build both targets:** run `application/build.ps1` with `-Target docker` or `-Target installer`.

---

# Installer Styling Guide

The Windows installer must match the TaskMesh website's visual identity as closely as Inno Setup allows. This file is the single source of truth for every colour, font, and layout decision in `taskmesh-setup.iss`.

---

## Inno Setup colour format — CRITICAL

Pascal/Delphi TColor uses **`$BBGGRR`** byte order (Windows COLORREF), which is the **reverse** of web hex (`#RRGGBB`). Always use the Pascal column below — never copy a web hex value directly.

The brand palette comes directly from `website/src/app/globals.css` (`--color-brand-*`). There is **no gold** in the brand — gold (`#FCD34D`) is a Buzz mascot body colour, not a UI colour. Do not use it for text or backgrounds.

| Token | Web `#RRGGBB` | Pascal `$BBGGRR` | CSS var | Usage |
|---|---|---|---|---|
| Brand 950 — deep indigo | `#1E1B4B` | `$4B1B1E` | `brand-950` | Panel/page dark backgrounds |
| Brand 900 — mid indigo | `#312E81` | `$812E31` | `brand-900` | Borders, dividers, hero gradient start/end |
| Brand 700 | `#4338CA` | `$CA3843` | `brand-700` | Hover states, secondary accents |
| Brand 600 | `#4F46E5` | `$E5464F` | `brand-600` | Hero gradient, primary buttons |
| Brand 500 — primary | `#6366F1` | `$F16663` | `brand-500` | Primary accent, links, active states |
| Brand 400 — light | `#818CF8` | `$F88C81` | `brand-400` | Headings on dark bg, icons |
| Brand 300 — soft | `#A5B4FC` | `$FCB4A5` | `brand-300` | Body text on dark bg, checklist items |
| Brand 200 | `#C7D2FE` | `$FED2C7` | `brand-200` | Taglines, muted labels |
| Brand 100 | `#E0E7FF` | `$FFE7E0` | `brand-100` | Subtle highlights, secondary panels |
| White | `#FFFFFF` | `$FFFFFF` | — | Primary text on dark backgrounds |
| Near-black | `#111827` | `$271811` | — | Text on light backgrounds |

---

## Typography

- **Font family:** `Segoe UI` — the Windows equivalent of Inter; set via `Font.Name := 'Segoe UI'` on every label
- **Fallback:** `Tahoma` (safe on all supported Windows versions)
- **Do not** use serif fonts or the default System font
- Weight equivalents: use `fsBold` for headings, `[]` (regular) for body

| Role | Size | Style | Colour (Pascal) |
|---|---|---|---|
| Page title / celebration heading | 18–20pt | `[fsBold]` | `$FFFFFF` (white) |
| Section heading | 13–14pt | `[fsBold]` | `$F88C81` (brand-400 light indigo) |
| Body / description | 10–11pt | `[]` | `$FCB4A5` (brand-300 soft indigo) |
| Tagline / hint | 9pt | `[]` | `$FED2C7` (brand-200 very soft indigo) |
| Error / warning | 10pt | `[fsBold]` | `$CA3843` (brand-700) |

---

## Panel & page styling

### Custom pages with dark backgrounds (e.g. celebration)
```pascal
Panel.Color      := $4B1B1E;   // brand-950 deep indigo
Panel.BevelOuter := bvNone;
Panel.BevelInner := bvNone;
```

### Input pages (light background — Inno Setup default chrome)
Inno Setup controls the surrounding chrome on standard wizard pages; we cannot fully override it. Compensate with:
- Well-written, on-brand copy in titles and descriptions
- Consistent `Segoe UI` font on any labels we do own

---

## Celebration / finish page

The celebration page (`CelebrationPage`) is a full custom `TWizardPage` with a deep-indigo `TPanel` covering the entire surface. Layout rules:

```
┌─────────────────────────────────────────────────────┐  ← $4B1B1E bg (brand-950)
│                                                     │
│  Buzz toward done  ✓                 ← 18pt bold white ($FFFFFF), top: 20
│                                                     │
│  ✓  Server running on http://localhost:PORT         │
│  ✓  Database initialized                            │  ← 11pt brand-300 ($FCB4A5)
│  ✓  Shortcuts created                               │    top: 70 / 96 / 122
│                                                     │
│  Click "Finish" to launch TaskMesh in your browser. │  ← 9pt brand-200 ($FED2C7)
│                                                     │    top: 165
└─────────────────────────────────────────────────────┘
```

- All labels left-aligned, `Left := 24`
- `AutoSize := True` on every label
- The port in "Server running on…" must be set dynamically in `CurStepChanged` at `ssPostInstall`, not hardcoded

---

## Bitmap assets (for the designer)

Inno Setup supports two bitmap slots. Both must follow the website's visual language.

### `assets/welcome.bmp` — Welcome & Finish sidebar (164 × 314 px, 24-bit BMP)
- Background: vertical gradient from `#4F46E5` (brand-600, top) to `#818CF8` (brand-400, bottom) — matches the website hero
- Top area: "TaskMesh" logotype in white, `Segoe UI` or similar sans-serif
- Bottom area: tagline "Buzz toward done." in `#C7D2FE` (brand-200)
- Optional: Buzz the bee (happy mood, ~120px tall) in the centre — reference `BeeMascot.tsx` for proportions

### `assets/banner.bmp` — Inner page header strip (497 × 58 px, 24-bit BMP)
- Background: horizontal gradient from `#4F46E5` (brand-600, left) to `#818CF8` (brand-400, right)
- Left side: TaskMesh logo mark + "TaskMesh" wordmark in white
- Right side: version badge — rounded pill, white outline, white text, e.g. `v1.0.0`

Reference the website hero gradient (`#312e81 → #4f46e5 → #7c3aed → #6366f1`) in `globals.css` for the correct colour feel. Do **not** use gold — that is Buzz's bee body colour, not a UI brand colour.

---

## Copy & voice

Follow Buzz's personality: warm, direct, practical. Never use passive or corporate language.

| Context | Example |
|---|---|
| Page subtitle | "Tell Buzz where to set up shop." |
| Port page subtitle | "Which port should Buzz listen on?" |
| Progress status | "Buzz is getting ready…" |
| Celebration heading | "Buzz toward done  ✓" |
| Finish button label | "Launch TaskMesh" |
| Error dialog | "Buzz hit a snag — [specific reason]. Please fix it and try again." |

---

## What Inno Setup cannot do

Be aware of these hard limits so we don't promise impossible things:

- **No CSS, no rounded corners, no drop shadows** on native controls
- **No custom button colours** on standard wizard nav buttons (Next/Back/Finish)
- **No web fonts** — only fonts installed on the user's machine (`Segoe UI` is safe from Windows 7+)
- **No transparency/blur** on standard pages
- **No animations** — the celebration page is static

The workaround for all of the above is the full-coverage `TPanel` approach used on the celebration page: create a `TWizardPage`, cover `Surface` with a styled `TPanel`, and build the UI entirely from `TLabel`, `TButton`, and `TPanel` children.
