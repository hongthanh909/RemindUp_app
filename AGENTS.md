# RemindUp engineering rules

These instructions apply to the entire repository.

## Product authority

- `docs/DECISIONS.md` is the product decision log. Do not ask the user to
  reconfirm decisions already recorded there.
- Preserve the local-first, single-user product model unless the user explicitly
  changes it.
- Use Vietnamese product copy unless a technical identifier must be English.

## Architecture

- Keep application UI in `app/PlannerApp.tsx` until a component has at least two
  real consumers or the file becomes materially harder to maintain.
- Keep IndexedDB types, schema, migrations, and seed data in `app/db.ts`.
- Do not add D1, R2, authentication, sync, analytics, or a generic abstraction
  before a requested workflow needs it.
- Do not keep example routes, starter components, unused assets, parallel state
  stores, or duplicate utilities.
- Prefer extending an existing type or helper over creating a second competing
  version.

## UI system

- The product palette is white/ivory with soft orange accents.
- Light and Dark Mode must use the same semantic tokens from
  `app/globals.css`; do not hard-code a separate visual language per component.
- Optimize first for iPhone, one-handed use, 44px minimum touch targets, safe
  areas, keyboard navigation, readable contrast, and reduced motion.
- Use Lucide components for icons. Do not add hand-written SVG icons.
- Every new async surface needs loading, empty, success, and error states.

## Data and security

- UI preferences may use localStorage. Product records belong in IndexedDB.
- A PIN must never be stored in plaintext. Treat a short PIN as an interface
  lock, not as strong encryption.
- Encrypt cloud backups client-side before upload.
- Never log task content, note content, PINs, encryption keys, recovery phrases,
  push subscriptions, or image data.

## Change discipline

- Read the closest existing implementation before editing.
- Make the smallest coherent change that completes the requested workflow.
- Remove superseded code in the same change.
- Do not generate placeholder backends, unused API clients, speculative
  interfaces, or duplicated CSS.
- Update `docs/DECISIONS.md` when a product rule changes.

## Verification

- Required before handoff: `npm run build`, `npx tsc --noEmit`, and the rendered
  HTML test.
- Use Playwright for interaction and responsive checks when UI behavior changes.
- Test Light and Dark Mode for any visual change.
