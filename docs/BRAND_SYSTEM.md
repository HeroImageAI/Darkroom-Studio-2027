# Darkroom Studio 2027 — initial brand system

Status: initial design specification, not a finished visual identity. No reference image accompanied the complete pasted brief; derive this baseline from the written visual direction and refine against the image when available. Do not reuse ATLAS names, marks, art or exact layouts.

## Identity

Wordmark: DARKROOM with STUDIO 2027 beneath or beside it at a smaller size. Premium, cinematic, restrained and readable. Product promise: “Create. Edit. Finish.” The working UI remains calm and precise, with the image as the focal point.

Initial symbol direction: a simple frame enclosing a D-shaped negative space with one deliberate light slit. Develop an original geometric SVG in Phase 1, not an AI raster logo. Test at 16, 24 and 32 px and in white, crimson and one-colour black. No complex aperture detailing that disappears at shortcut size. Logo work is bounded to establishing a usable first mark.

Original exposure motif: two or three gently offset crimson light curves crossing a dark field with varied intensity. Use sparingly on splash/onboarding/empty states. Never behind the working canvas or across text. Honour reduced motion; no decorative perpetual animation in working views. No photography or decorative assets need to be generated for planning.

## Token architecture

`apps/web/src/styles/tokens.css` is the single source for visual values in Phase 1. Components consume semantic CSS custom properties, not hex literals. Primitive palette supports semantic roles; status/interaction tokens may be adjusted centrally for contrast. Tests enforce token use in components where practical.

| Primitive token | Initial value | Purpose |
| --- | --- | --- |
| black | #08090B | Application background |
| charcoal | #14161A | Panels |
| graphite | #292C31 | Raised surfaces, subtle boundaries |
| gunmetal | #45484E | Stronger dividers/control edges |
| crimson | #E31824 | Brand, selected accent, primary action |
| deep-crimson | #8F1018 | Muted illumination and active accent |
| white | #F2F2F3 | Primary text |
| grey | #9A9CA2 | Secondary text |

Semantic roles: `surface-app/panel/raised/canvas`, `text-primary/secondary/disabled`, `border-subtle/control`, `action-primary/hover/pressed`, `focus-ring`, `selection-border/fill`, `state-error/success/warning/info`. Canvas uses neutral tokens. Crimson is an accent, never the dominant page background. Status palettes must be chosen and contrast-checked during Phase 1; success/error also require icons and words.

Crimson with small white button text must be measured rather than assumed compliant. If it fails contrast, darken the action-background semantic token while retaining the brand primitive. Muted grey cannot be used blindly on raised surfaces; verify all actual token pairs.

| Token family | Initial scale |
| --- | --- |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64 px |
| Radii | 4 px controls, 8 px panels, 12 px dialogs; pill only for status/chips |
| Typography | Segoe UI, Inter if bundled/licensed, system sans fallback; 12/14/16/20/28/40 px |
| Type weight | 400 body, 500 controls, 600 section headings, 700 restrained branding |
| Line height | 1.45 body, 1.2 headings |
| Border | 1 px standard; 2 px focus ring with 2 px offset |
| Shadow | Panel: none or subtle; overlay: 0 16px 48px rgba(0,0,0,.5) |
| Panel sizes | Topbar 64 px; left 240 px; right 320 px; central content flexes |
| Motion | 120 ms hover, 180 ms panel; zero nonessential motion when reduced-motion requested |

Branding can use modest letter spacing; controls/body use normal spacing. At narrow widths, collapse contextual panels into keyboard-accessible drawers and preserve the centre. Design for workstation use without making setup/library unusable on smaller windows.

## Reusable UI contracts

Button variants primary/secondary/quiet/danger share sizing, focus and disabled behaviour. Field owns label, help/error text and validation linkage. Panel owns surface/spacing. Status owns icon + text, not colour alone. Dialog owns focus trap, initial focus, Escape/close and focus return. Common AssetCard later owns preview/selection/actions. No independent styling system per screen.

Hover never conveys unique information. Selected tools show an outline/icon and accessible pressed state. Disabled controls explain availability in adjacent text, not hover-only hints. Loading actions retain their label, show progress, avoid duplicate submission and announce meaningful changes. Error messages state what happened and a useful recovery action while preserving the user's brief/document.

## Accessibility acceptance

Target WCAG AA: normal text 4.5:1, large text 3:1, meaningful control boundaries/focus/non-text elements 3:1 where applicable. Verify computed rendered states, not just the palette. Keyboard operation covers navigation, dialogs, reference management, result selection and export. Canvas tools need explicit labels and documented shortcuts with non-pointer alternatives for properties. No colour-only model/job/save status. Announce save/error/completion via appropriate live regions without flooding progress announcements. Browser QA includes focus visibility, zoom and reduced motion.

## Phase 1 brand deliverables

Token stylesheet, shared components, original SVG symbol, favicon, simple wordmark and one restrained exposure motif if useful for the setup empty state. Validate in the shell at desktop and narrow widths. No extensive logo system, promotional site or unrelated visual exploration before the product works.
