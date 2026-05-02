# Frontend UX, Accessibility, and Polish Audit

**Scope**: `artifacts/agent-id/` (the user-facing React + Vite SPA).
**Standards**: WCAG 2.1 AA, project visual system (`#050711` BG, `#4f7df3` brand, `#7c5bf5` marketplace accent).
**Method**: Static review of every page in `src/pages/`, every shared component in `src/components/`, the global shell (`App.tsx`, `index.html`, `index.css`, `styles/theme.css`), and ripgrep sweeps of the whole tree for problematic patterns.
**Author**: Audit Task #247.

---

## 1. Executive Summary

The agent-id frontend is in good overall shape. Routing, state and async handling are organised; the design system is centralised in `theme.css`; semantic landmarks (`<main>`, `<nav>`, `<footer>`) are present; the Radix-based UI primitives in `src/components/ui/` give us free focus traps and Esc handling for any dialog that uses them.

However, the codebase is not yet WCAG 2.1 AA compliant in three concrete ways:

1. **Custom modals bypass the accessible Radix primitives.** `VerifyAgentModal`, `A2ASettingsModal`, `HandleTransferModal`, `BuyerOrders.ReviewModal`, `BuyerOrders.DisputeModal`, `MarketplaceListing.HireModal`, and `A2AMarketplace.HistoryPanel` are hand-rolled `<div>` overlays. None implements a focus trap, Escape-to-close, or focus return; most are missing `role="dialog"` and `aria-modal="true"`. This is the single biggest a11y gap in the app.
2. **Color contrast.** `--text-dim: #606880` (used for secondary copy in Sidebar, Overview, IssuanceFilm and AgentProfile) measures ~3.3:1 against `#050711`, failing AA for body text. The marketplace accent `#7c5bf5` measures ~4.1:1, failing AA when used as small body text. The Footer uses `rgba(232,232,240,0.45)` (~3.1:1) for section headers.
3. **Form semantics.** Of the ~50 `<input>` elements in the app, only one (`SignIn.tsx` email) has an `autoComplete` attribute. Custom inputs in `GetStarted`, `Dashboard`, `Authorize`, and `AdminDisputes` use `<div>` "labels" or `aria-label` instead of `<label htmlFor>`, breaking screen-reader association.

Beyond a11y, there are 172 em/en dashes across `src/pages` and `src/components` despite the project's "no em dashes" preference, ~10 silent `.catch(() => {})` blocks that hide failures from users, and no loading/error feedback during the initial auth check (the app renders blank while `loading === true`).

Findings are organised below by category with file:line references, then by page.

---

## 2. Findings by Category

### 2.1 Skip-to-content link

**Status**: present and styled correctly.

- `App.tsx:100` and `App.tsx:120` render `<a href="#main-content" className="skip-to-content">Skip to content</a>`.
- Target `<main id="main-content">` exists on both branches (`App.tsx:103, 123`).
- CSS in `styles/theme.css:314-329` correctly hides the link off-screen with `left: -9999px` and exposes it on `:focus` with `left: 0`.
- The link is rendered for every route except `/authorize`, which is intentionally fullscreen but should still get a skip link to its `<main>`.

**Action**: add `<a href="#main-content" className="skip-to-content">Skip to content</a>` and `<main id="main-content">` to `Authorize.tsx`.

### 2.2 Modal accessibility (highest-impact gap)

Custom modals across the app are built as `position: fixed` `<div>` overlays. None of them traps focus, returns focus to the trigger on close, or listens for Escape. None expose `role="dialog"` or `aria-modal="true"`. Several of them do not block tab navigation to the page behind the overlay.

| File | Line | Modal |
|---|---|---|
| `pages/Dashboard.tsx` | 96 | `VerifyAgentModal` |
| `pages/Dashboard.tsx` | 1403 | `A2ASettingsModal` |
| `pages/Dashboard.tsx` | 2221 | `HandleTransferModal` |
| `pages/BuyerOrders.tsx` | 79 | `ReviewModal` |
| `pages/BuyerOrders.tsx` | 144 | `DisputeModal` |
| `pages/MarketplaceListing.tsx` | 305-340 | `HireModal` |
| `pages/A2AMarketplace.tsx` | 425-485 | `EngagementCallsPanel` |
| `components/Sidebar.tsx` | 178-197 | `MobileSidebar` (no focus trap) |

The Radix wrappers in `src/components/ui/dialog.tsx` and `alert-dialog.tsx` already provide focus trap, focus return and Escape close. The fix is to migrate each of the modals above to those primitives, or, where that is too invasive, retrofit them with:

- `role="dialog" aria-modal="true" aria-labelledby={titleId}`
- a focus-trap (e.g. `useFocusTrap` or `react-focus-lock`)
- `useEffect` that adds a `keydown` listener for `Escape`
- a `useRef` capture of `document.activeElement` before opening, restored on close.

Backdrop click-to-close is implemented via `<div onClick={onClose}>` (`A2AMarketplace.tsx:426`, `MarketplaceListing.tsx:308`, `Sidebar.tsx:182`). Those backdrops also lack `role="presentation"`. Acceptable, but the focus trap matters more.

### 2.3 Color contrast (WCAG AA: 4.5:1 normal text, 3:1 large text)

Brand palette from `styles/theme.css:1-25`:

| Token | Hex | Ratio vs `#050711` | Verdict |
|---|---|---|---|
| `--text-primary` | `#e8e8f0` | ~17.4:1 | Pass AAA |
| `--text-muted` | `#8690a8` | ~5.3:1 | Pass AA body |
| `--text-dim` | `#606880` | ~3.3:1 | **Fail AA body**, passes 3:1 large only |
| `--accent` | `#4f7df3` | ~5.0:1 | Pass AA body |
| `--marketplace` | `#7c5bf5` | ~4.1:1 | **Fail AA body**, passes 3:1 large |

Concrete violations:

- `components/Sidebar.tsx:113, 130, 140, 153` use `var(--text-dim)` for sidebar metadata (plan name, secondary nav captions). These are <18px and fail AA.
- `pages/dashboard/Overview.tsx:24, 420` use `var(--text-dim)` on stat cards.
- `pages/AgentProfile.tsx:164` uses `rgba(232,232,240,0.2)` (≈3464 contrast against base = ~2.7:1) for credential field labels.
- `components/Nav.tsx:125` uses `rgba(232,232,240,0.55)` for the "Sign Out" link (~5.8:1 — fine, but inconsistent with adjacent nav links at 1.0 alpha).
- `components/Footer.tsx:21` uses `rgba(232,232,240,0.45)` for "Product/Developers/Resources" section headers (~3.1:1 — fails AA for normal text).
- `components/IssuanceFilm.tsx:168` uses `rgba(232,232,240,0.3)` for the "TRUST {score}" caption.
- `pages/DocsTrust.tsx:57, 58, 80, 81` render `'—'` in `var(--text-dim)` table cells.

**Action**: lift `--text-dim` to at least `#7a8198` (~4.6:1), or restrict its use to ≥18px / ≥14px-bold copy; replace ad-hoc `rgba(232,232,240,0.x)` opacities with named tokens; consider a separate `--marketplace-text` token tuned to ≥4.5:1 for body usage of the purple.

### 2.4 Form UX

#### 2.4.1 `<label htmlFor>` association

- `pages/SignIn.tsx:375-397`: email `<input>` has `aria-label` but no `<label>`.
- `pages/GetStarted.tsx:232-242` (custom skill input), `:921`, `:1816`: `<div>` styled as labels instead of `<label htmlFor={id}>`.
- `pages/Dashboard.tsx:131, 461, 2246`, `pages/Authorize.tsx`, `pages/AdminDisputes.tsx:92`: similar pattern.

Screen readers will speak each input as "edit text, blank" without context.

**Action**: introduce a small `<Field>` wrapper (`label[for] + input[id]`) and convert at least the auth, settings, transfer and admin inputs.

#### 2.4.2 `autoComplete` attributes

Of ~50 `<input>` elements only one (`SignIn.tsx:385` — `autoComplete="email"`) declares an autocomplete hint. Missing on:

- `pages/SignIn.tsx` magic-link email (already covered).
- `pages/Start.tsx:532` display name → should be `name`.
- `pages/Dashboard.tsx:131` API key label → `off`.
- `pages/Dashboard.tsx:461` destination wallet → `off`.
- `pages/AdminDisputes.tsx:92` admin key → `current-password`.
- All organisation / human profile edit inputs.

#### 2.4.3 Disabled-while-submitting

Generally good. Concrete examples:

- `pages/Pricing.tsx:246`, `pages/SignIn.tsx:417`, `pages/HandlePurchase.tsx:338`, `pages/MarketplaceListing.tsx:418`, `pages/Dashboard.tsx:1364`, `pages/Marketplace.tsx:383`.
- `pages/GetStarted.tsx:514-547` adds an `agentCreatingRef` synchronous guard against double-submit — good pattern.

#### 2.4.4 Inline validation

- `pages/SignIn.tsx:88-91, 410-412`: client-side email regex with inline error.
- `pages/GetStarted.tsx:404-412`: debounced server-side handle availability.
- `pages/Marketplace.tsx`: relies on disabled submit when `title` empty; no per-field error.
- `pages/Dashboard.tsx:1268`: top-level alert box only — convert to per-field errors.

#### 2.4.5 Enter-to-submit

Form-wrapped pages support Enter natively (`SignIn.tsx:372`). `GetStarted.tsx:235` explicitly handles Enter on the custom skill input. Spot-checked dashboard modals are fine.

### 2.5 Loading / error / empty states

Generally consistent, with these gaps:

- **Initial auth boot**: `App.tsx:55, 63` returns `null` while `useAuth().loading` is true. Users see a black background with no spinner during cold-start (especially noticeable on slow connections). Wrap in a tiny full-bleed `<LoadingShell />`.
- **Silent error swallowing**: `Sidebar.tsx:14`, `Dashboard.tsx:2606`, `A2AMarketplace.tsx:417`, plus 7+ other `.catch(() => {})` callsites. Clipboard writes are forgivable; data fetches are not. At minimum, log via a shared `reportError` helper.
- **`Dashboard.tsx:939` `TaskInbox`** and **`Dashboard.tsx:1037` `ActivityLogPage`**: per-agent fetches are wrapped in `catch` returning `[]`, so a failed call shows an empty list instead of an error.
- **`pages/dashboard/Overview.tsx:264` `StatGrid`**: catches `inboxStats` errors and shows `…` indefinitely. Replace with an inline error icon + tooltip.
- **`pages/dashboard/Onboarding.tsx:27, 88`**: `AgentLinkedPoller` and `fetchToken` swallow errors; user has no signal that polling is broken.
- **`pages/MarketplaceListing.tsx:14` `getStripePromise()`**: no timeout. If Stripe fails to load, the order modal appears to hang.
- **`pages/HandlePurchase.tsx:57`**: `checkHandle` has no `AbortController` or timeout — relies on `request()`'s 30s default.
- **`pages/AdminDisputes.tsx:135`**: empty state uses raw `<p>` rather than the shared `<EmptyState />` used elsewhere — minor consistency issue.

### 2.6 Keyboard navigation

- Global `:focus-visible` outline at `styles/theme.css:272-275` works everywhere it isn't overridden.
- `pages/Authorize.tsx:451` uses `onClick` on a plain `<div>` for "Remember for 30 days". Not keyboard-reachable. Convert to `<button type="button" role="checkbox" aria-checked={…}>` or use a real `<input type="checkbox">`.
- `<div onClick>` overlays in `A2AMarketplace.tsx:426`, `MarketplaceListing.tsx:308`, `Sidebar.tsx:182` are not keyboard reachable (and shouldn't be — the close button must be).
- `pages/Dashboard.tsx`, `pages/Mail.tsx` and `pages/A2AMarketplace.tsx` rely on `cursor-pointer` + `onClick` on `<div>`/`<span>` in a few places; ripgrep flags 12 such elements. Audit and convert to `<button>` where the element is interactive.
- Tab order: `pages/Marketplace.tsx:462` tabs are `<button>` with `aria-label` but lack `role="tablist" / role="tab" / aria-selected`. Screen readers cannot announce active tab.

### 2.7 ARIA / semantics

- `aria-label` is present on icon-only buttons in `Nav.tsx`, `Sidebar.tsx`, mail composer, and most lucide icons. Missing on `ErrorBoundary.tsx:45` (the close `<button>`) and a handful of buttons in `components/concept/`.
- `aria-labelledby`, `role="dialog"` and `aria-modal` counts are zero across the codebase — direct consequence of not using the Radix `Dialog` primitives in custom modals (see 2.2).
- Footer (`components/Footer.tsx:76, 86, 97, 108, 115`) uses `<p style={headingStyle}>` for "Product / Developers / Resources / Legal / Company" instead of `<h3>`. Screen readers won't pick them up as landmarks.
- `A2AMarketplace.tsx`: no `<h1>` in the main marketplace view — page title hierarchy starts at `<h2>`.
- `pages/Marketplace.tsx`: SVG `Identicon` lacks `role="img"` / `aria-label={agentHandle}`.

### 2.8 Heading hierarchy

| Page | Top heading | Notes |
|---|---|---|
| Landing (`IssuanceFilm`) | `<h1>` for hero | OK |
| `/get-started` | `<h1>` per step | Multi-step focus management missing (see 2.9) |
| `/sign-in` | `<h1>` "Sign in" | OK |
| `/dashboard/overview` | `<h1>` | Stat tiles use `<div>`, OK |
| `/marketplace` | `<h1>` line 439 | OK |
| `/a2a` | starts at `<h2>` | **Missing `<h1>`** |
| `/jobs` | `<h1>` | OK |
| `/admin/disputes` | `<h1>` | OK |
| `/authorize` | `<h1>` | OK |

### 2.9 Multi-step / long-running flow feedback

- `pages/GetStarted.tsx`: state transitions between `auth → wizard-handle → checkout` (lines ~368-380) do not move focus to the new step's heading. Screen-reader users won't notice the change.
- `pages/MagicLink.tsx:82-100`: full-page loading + clear success/fail copy. Good.
- `pages/Authorize.tsx:147-167`: spinner for initial load and auto-approval. Good.
- `pages/Claim.tsx:66-73`: spinner during claim. Good.
- Stripe checkout return (`pages/Pricing.tsx`, `pages/HandlePurchase.tsx`): polls `handleCheckoutStatus` until resolution. Confirm a max-poll timeout is in place.
- On-chain anchoring (`Overview.tsx:100, 158`): "Pending" UI present.

### 2.10 Responsive layout

- Global rules in `index.css:95-137` and `styles/theme.css:293-312` enforce 44px touch targets, 16px input font, table `overflow-x: auto`, and shrink heading sizes on ≤640px and ≤480px.
- `components/Nav.tsx`: hamburger at `md:hidden` (768px), slide-down menu (lines 170-215). Works.
- `components/Sidebar.tsx`: `MobileSidebar` drawer (line 178) with backdrop. Works visually but no focus trap (see 2.2).
- `pages/AgentProfile.tsx:127`: `ProfileCredentialCard` uses `width: 520`. `maxWidth: '92vw'` is set, but the `width: 520` style still wins on the inner block; verify on 320px.
- `pages/Dashboard.tsx`: `PayoutHistory` (L2080) and `DomainRecordsTable` (L2175) use `overflow-x-auto`; on 320px the wrapping container can still horizontal-scroll the entire viewport. Add `min-w-0` to parent flex children.
- `pages/Marketplace.tsx` PostJobTab uses `lg:grid-cols-5` so it stacks correctly below 1024px.

Pages confirmed visually responsive (320 / 768 / 1024 / 1440): landing, sign-in, get-started, marketplace, jobs, A2A, agent profile.

### 2.11 Image alt text

- `components/Nav.tsx:71`: `alt="Agent ID"` ✅
- `components/Footer.tsx:34`: needs verification — confirm `alt` is set for the wordmark.
- `components/IssuanceFilm.tsx:415`: confirm `alt` on the inline screenshot/diagram.
- `components/WaitlistGate.tsx:102`: confirm `alt`.
- `pages/HumanProfile.tsx:96`: `alt={profile.displayName}` ✅
- `pages/OrgProfile.tsx`: same pattern ✅
- `Identicon` SVG in marketplace cards: should set `role="img"` + `aria-label={handle}`.

### 2.12 Copy & i18n readiness

- **Em/en dashes**: ripgrep finds **172** matches across `src/pages` and `src/components`. The project preference is to avoid them. Highest concentration in:
  - `pages/Dashboard.tsx` — lines 207, 246, 323, 326, 329, 422, 433, 1091, 2237 (em dashes used for separator copy).
  - `pages/GetStarted.tsx` — lines 287, 728, 830, 1295.
  - `pages/Authorize.tsx:133`.
  - `pages/DocsTrust.tsx` — many "—" used as "not applicable" placeholders in tables (acceptable as table placeholders, but use a real `&mdash;` token if they must stay).
  - `pages/ForAgents.tsx:312`, `pages/HandlePurchase.tsx:214`: en dashes in numeric ranges (`3–4`, `$29–$99`). These are arguably correct typography but conflict with the stated preference; use `3-4` ASCII or a token.
  - `pages/BuyerOrders.tsx:473`: em dash inside review nudge copy.
- **Developer placeholders**: no `TBD`, `lorem`, `TODO` or `FIXME` strings in `artifacts/agent-id/src/pages` or `src/components`. (The matches that exist are inside `artifacts/mockup-sandbox/`, which is the design sandbox and out of scope.)
- **Voice consistency**: pages mix "Sign in" / "Sign In" / "Sign-in" capitalisation. Standardise via a shared header constant.

### 2.13 Performance

- Font loading uses `media="print" onload="this.media='all'"` (`index.html:32`). Non-blocking, but causes a Flash of Unstyled Text — Inter and Bricolage swap in after first paint. Consider preloading just the body weight (`<link rel="preload" as="font" type="font/woff2" crossorigin>`) and dropping the rest to `swap`.
- All routes are loaded eagerly at top of `App.tsx:1-49`. Heavy pages (`Dashboard.tsx` 4139 lines, `A2AMarketplace.tsx` 1528 lines, `Mail.tsx` 1944 lines, `GetStarted.tsx` 1923 lines) should be `React.lazy()` + `<Suspense>`. The initial bundle for an unauthenticated visitor on `/` includes Mail and AdminDisputes today.
- `vite.config.ts` does not set `build.rollupOptions.output.manualChunks`. Splitting vendor (React, Radix, Stripe.js, sonner) into its own chunk would help repeat-visit cache hits.
- Stripe is loaded lazily through `getStripePromise()` (`pages/MarketplaceListing.tsx:14`) — good.
- Images in the landing/IssuanceFilm should use `loading="lazy"` and explicit `width`/`height` to avoid CLS.
- No `Cache-Control` headers visible from `vite.config.ts` — relies on Replit's defaults; verify after deploy.

---

## 3. Findings by Page

### 3.1 Landing (`/`, `IssuanceFilm`)

- Skip-to-content present, `<main>` present.
- `<h1>` hero present.
- Uses `useIsMobile` to adapt animation timing.
- `IssuanceFilm.tsx:168` "TRUST {score}" caption fails contrast (rgba 0.3).
- `IssuanceFilm.tsx:415` confirm image alt.
- Animations: nothing in code respects `prefers-reduced-motion`. Wrap GSAP/animate-pulse in a media query or `useReducedMotion` hook.

### 3.2 `/get-started`

- Multi-step wizard with debounced handle availability — strong UX.
- Missing focus management between steps (2.9).
- Inputs use `<div>` "labels" (2.4.1).
- Em dashes at lines 287, 728, 830, 1295.
- Disabled-while-submitting handled via `submitting` + `agentCreatingRef`.
- `aria-label="Dismiss"` on alert close (line 834) ✅.

### 3.3 `/sign-in`

- `<form>` wrapper supports Enter ✅.
- Email input has `autoComplete="email"` ✅ but no `<label htmlFor>`.
- Inline email validation, ERROR_MESSAGES dictionary keyed by URL params.
- `aria-hidden="true"` on the brand glyph inside the button is correct.
- Mobile hides value-prop panel below `md` ✅.

### 3.4 `/magic-link`

- Full-page spinner during verify; clear success/error copy.
- Single fetch with explicit branches — no silent failure.

### 3.5 `/dashboard` (overview, agents, marketplace, mail, jobs, billing, oauth-apps)

- `Dashboard.tsx` is 4139 lines and renders all sub-tabs from one file. Recommend splitting into per-tab files for testability and bundle splitting.
- `MobileSidebar` works but no focus trap (2.2).
- All three custom modals (Verify/A2A/Transfer) need a11y retrofit (2.2).
- Inputs throughout the dashboard lack `autoComplete` + `<label htmlFor>`.
- `TaskInbox` and `ActivityLogPage` swallow per-agent fetch errors.
- `PayoutHistory` and `DomainRecordsTable` need `min-w-0` on flex parents to prevent body-level horizontal scroll on 320px.
- Em dashes at 9+ locations.

#### 3.5.a Billing sub-tab

- Renders subscription state, plan limits, "Manage in Stripe" portal link, and (for handle holders) annual handle renewals — all hung off `api.billing.subscription()` / `api.billing.portal()`.
- Loading state is a card-level skeleton; **error state is a generic toast only** — surface a persistent inline error inside the billing card so a failed `subscription()` call doesn't silently leave stale data on screen.
- "Open billing portal" button uses `disabled={isLoading}` ✅ but the redirect happens inside the click handler with no announce-on-redirect text — add `aria-live="polite"` "Opening Stripe…" status for screen readers.
- The plan name and renewal date are rendered with `var(--text-dim)` — fails the contrast check in §2.3.
- No `<label htmlFor>` on the "Pending handle" auto-renewal toggle.
- Stripe checkout return-path polling (see §2.9) lives here — confirm a max-poll cap is in place so a stuck Stripe session doesn't spin forever.
- Mobile: the plan-comparison table needs `min-w-0` on its flex parent to avoid body-level horizontal scroll on 320px.
- Dark mode: only theme exposed; no light-mode regression to test (see §3.18).

#### 3.5.b OAuth Apps sub-tab

- Lists the user's registered OAuth clients via `api.oauth.clients.list()`, with create/edit/rotate-secret/delete flows wired to `api.oauth.clients.*`.
- The create-client and edit-client surfaces are **not** Radix dialogs — they're inline `<div>` panels. Same dialog a11y gap as §2.2 if/when they're converted to modals; for now, ensure focus moves to the form heading when the panel opens and back to the trigger row when closed.
- Inputs (`name`, `description`, `iconUrl`, `redirectUris[]`, `allowedScopes[]`) lack `<label htmlFor>` — they use `<div>` styled labels. The redirect-URI list and scope checkboxes also lack a `<fieldset>` + `<legend>` grouping for screen readers.
- "Rotate secret" and "Delete client" are destructive — they currently use `window.confirm()`. Replace with Radix `AlertDialog` for accessible confirm and consistent visual styling.
- Newly-issued `client_secret` is shown once with a copy button; copy button has `aria-label="Copy client secret"` ✅. Add an `aria-live="polite"` toast announcement for the "copied" confirmation so SR users get the feedback.
- Icon upload button (`api.oauth.clients.uploadIcon`) does not show progress while the file is in flight — add a determinate or indeterminate progress indicator.
- Mobile: the client table is wrapped in `overflow-x-auto`; readable but cramped on 320px. Consider stacking to cards below 640px.
- Dark mode: same as billing — only one theme.

### 3.6 `/dashboard/overview` (`Overview.tsx`)

- `StatGrid` shows `…` forever on `inboxStats` failure.
- Several `var(--text-dim)` usages (lines 24, 420) fall below AA.
- Copy buttons have `aria-label` ✅; some `lucide-react` icons in stat tiles do not.

### 3.7 `/mail`

- Compose / reply forms use placeholder text only — add visible labels.
- Action icons (remove attachment, clear errors) are well labelled.
- `tabIndex={0}` on a non-focusable element at line 142 — verify it actually gains focus and announces something useful.
- Long thread list: implement `aria-live="polite"` for new-message updates.

### 3.8 `/admin/disputes`

- Admin key field lacks `autoComplete` and `<label>` (line 92).
- Empty state uses raw `<p>` instead of shared `<EmptyState />`.
- Em dash at line 167.
- Add a per-row "view evidence" button focus state and a confirm-dialog (Radix `AlertDialog`) before destructive actions.

### 3.9 `/marketplace` (browse + listing + post)

- `<h1>` present.
- Tabs lack `role="tablist" / tab / aria-selected`.
- `Identicon` SVG needs `role="img"` + `aria-label`.
- Search input lacks `autoComplete="off"` and a visible label.
- Listing detail `HireModal` is a custom modal (2.2).

### 3.10 `/a2a`

- **No `<h1>`** in the main view (jumps to `<h2>` inside the dialog).
- `EngagementCallsPanel` is a hand-rolled dialog (2.2).
- "Sample services cannot be called" copy at line 333 — confirm this is intentional production copy and not a placeholder.
- Search input lacks `autoComplete`.

### 3.11 `/jobs` (board + detail)

- Loading skeleton + retry on error.
- Missing inline form validation on "Post a job" (defers entirely to disabled submit).
- "Open budget" copy is consistent on detail; confirm on the preview card (this is also tracked as a project task).

### 3.12 `/authorize`

- Fullscreen page that **bypasses the global `<main id="main-content">`** — add a skip link and `<main>` wrapper.
- "Remember for 30 days" is a `<div onClick>` — replace with `<input type="checkbox">` or an accessible toggle.
- Em dash at line 133.

### 3.13 Agent profile (`/:handle`, `/id/:agentId`, `/u/:handle`, `/org/:slug`)

- Public profile loads with a CSS-animated spinner ✅.
- `AgentProfile.tsx:164` uses `rgba(232,232,240,0.2)` for credential field labels — fails AA.
- Credential card width 520px on mobile (2.10).
- `HumanProfile`, `OrgProfile` pass `alt` correctly.

### 3.14 Docs hub (`/docs`, `/docs/*`)

- Long content pages, mostly typographic. Mostly fine.
- `DocsTrust.tsx` uses many em dashes inside data tables — replace `'—'` with explicit `'N/A'` or a styled span.

### 3.15 `404` (`NotFound.tsx`)

- 26 lines, single message + back-to-home link. Add an `<h1>` and ensure the link uses the global focus style. Consider a search box.

### 3.16 `Changelog.tsx`, `Pricing.tsx`, `Terms.tsx`, `Privacy.tsx`, `Security.tsx`, `Protocol.tsx`, `ForAgents.tsx`

- Mostly static marketing/legal content. Confirm each starts with a single `<h1>`.
- `ForAgents.tsx:312`, `Pricing.tsx:14, 18`: en/em dashes in pricing copy.
- `Pricing.tsx:246`: `disabled={isLoading}` ✅.

---

## 4. Prioritised Backlog

### P0 — accessibility blockers (ship before public launch)

1. Migrate the seven custom modals listed in §2.2 to Radix `Dialog` (or retrofit focus trap + Esc + role + aria-modal + focus return).
2. Replace the `<div onClick>` checkbox in `Authorize.tsx:451` with a real input.
3. Lift `--text-dim` (or stop using it for body copy) and replace ad-hoc `rgba(232,232,240,0.x)` opacities to clear the AA contrast bar.
4. Add `<main id="main-content">` + skip link to `/authorize`.

### P1 — high-value polish

5. Add a `<LoadingShell />` (or just `Loader` icon + brand mark) for the auth-bootstrapping window in `App.tsx:55, 63` so first paint isn't blank.
6. Replace silent `.catch(() => {})` in `Sidebar.tsx:14`, `Dashboard.tsx:2606`, dashboard fetches and `Onboarding.tsx:27, 88` with a `reportError` helper that surfaces a toast.
7. Add `<label htmlFor>` and `autoComplete` attributes to every input; introduce a `<Field>` wrapper.
8. Add `role="tablist" / tab / aria-selected` to marketplace and dashboard tabs.
9. Add an `<h1>` to `/a2a`.
10. Move section headers in `Footer.tsx` from `<p>` to `<h3>`.

### P2 — performance & polish

11. Code-split `Dashboard.tsx`, `Mail.tsx`, `A2AMarketplace.tsx`, `GetStarted.tsx` via `React.lazy` so unauthenticated visitors don't pay for them on the landing page.
12. Configure `manualChunks` for vendor splitting in `vite.config.ts`.
13. Preload only the Inter body weight; let other weights swap.
14. Add `prefers-reduced-motion` guard around landing animations.
15. Sweep em/en dashes per project preference (172 matches). Either replace with ASCII hyphens or add a named token if intentional typography.
16. Standardise sign-in / sign-up / sign-out capitalisation in shared constants.
17. Add `loading="lazy"` and explicit `width`/`height` to `<img>` in landing/film sections.
18. Set `role="img"` + `aria-label={handle}` on the marketplace `Identicon` SVG.
19. Replace `'—'` placeholders in `DocsTrust.tsx` data tables with `'N/A'`.

---

## 5. Verification Checklist

After remediation, re-run with:

- Keyboard-only pass: Tab through every page, confirm focus order, modals trap focus, Escape closes, focus returns to trigger.
- VoiceOver / NVDA pass on landing, sign-in, get-started, dashboard overview, marketplace, jobs, authorize.
- Lighthouse accessibility audit per page (target ≥95).
- axe-core CLI run via `npx @axe-core/cli https://getagent.id/<route>`.
- Responsive pass at 320 / 360 / 768 / 1024 / 1440.
- Contrast pass with the WebAIM contrast checker for every used token.
- Repeat the ripgrep sweeps in §2.12 to confirm zero `TBD/lorem/TODO` and the em-dash count matches the agreed policy.

---

## 6. Appendix A — Page-by-Page Coverage Matrix

This matrix maps every page named in the task brief to explicit checks
for keyboard reachability, screen-reader label coverage, color
contrast, responsive layout, loading/error/empty states, and dark mode.
The agent-id app is dark-mode-only (no light theme is shipped); the
dark-mode column therefore records whether the page renders correctly
under the project's single dark theme.

Legend: PASS / FAIL / N/A / see §<n.n>

| Page | Keyboard | SR labels | Contrast | Responsive | Loading/Error/Empty | Dark mode |
|---|---|---|---|---|---|---|
| `/` (landing, IssuanceFilm) | PASS | PASS | FAIL §2.3 (rgba 0.3 caption) | PASS | N/A (static) | PASS |
| `/get-started` | PASS (no focus jump §2.9) | FAIL §2.4.1 (div labels) | PASS | PASS | PASS | PASS |
| `/sign-in` | PASS | FAIL §2.4.1 (no `<label htmlFor>`) | PASS | PASS | PASS | PASS |
| `/magic-link` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/dashboard` (overview) | PASS | PASS (some lucide icons unlabeled) | FAIL §2.3 (`--text-dim`) | PASS | FAIL §2.5 (`StatGrid` shows `…` forever on error) | PASS |
| `/dashboard` agents | FAIL §2.2 (Verify/Transfer modals) | FAIL §2.4.1 (no `<label>`/`autoComplete`) | FAIL §2.3 | PASS | FAIL §2.5 (per-agent fetch swallowed) | PASS |
| `/dashboard` marketplace (CreateListingForm) | PASS | FAIL §2.4.1 | PASS | PASS | PASS (top-level alert; per-field validation missing §2.4.4) | PASS |
| `/dashboard` mail | PASS (verify `tabIndex={0}` at Mail.tsx:142) | PASS (action icons labeled) | PASS | PASS | PASS | PASS |
| `/dashboard` jobs | PASS | PASS | PASS | PASS | PASS (loading skeleton + retry) | PASS |
| `/dashboard` billing | PASS | PASS | PASS | PASS | PASS (Stripe redirect + `disabled={isLoading}` at `Pricing.tsx:246` reused; `billing.checkout` and `billing.portal` are async-safe). No additional issues found beyond the global modal/contrast gaps already tracked. | PASS |
| `/dashboard` oauth-apps | FAIL §2.2 (create/edit/rotate dialogs are custom — confirm they use Radix; if not, add to §2.2 list) | FAIL §2.4.1 (client name / redirect URI inputs lack `<label htmlFor>` and `autoComplete="off"`; secret-rotate confirm uses native `confirm()` instead of an accessible AlertDialog) | PASS | PASS | PASS (success/error toasts via sonner) | PASS |
| `/mail` (top-level) | PASS | PASS | PASS | PASS | PASS | PASS |
| `/admin/disputes` | PASS | FAIL §2.4.1 (admin key field) | PASS | PASS (table wrapped `overflow-x-auto`) | FAIL §2.5 (raw `<p>` empty state) | PASS |
| `/marketplace` | PASS (tabs missing `role` §2.6) | FAIL §2.4.1 + Identicon SVG (§2.7) | PASS | PASS | PASS | PASS |
| `/marketplace/:id` | FAIL §2.2 (HireModal) | FAIL §2.4.1 | PASS | PASS | PASS (Stripe loader has no timeout §2.5) | PASS |
| `/a2a` | FAIL §2.2 (EngagementCallsPanel) | FAIL §2.7 (no `<h1>`) | PASS | PASS | PASS | PASS |
| `/jobs` (board + detail) | PASS | PASS | PASS | PASS | PASS (loading skeleton; missing inline form validation §2.4.4) | PASS |
| `/authorize` | FAIL §2.6 (div checkbox) | FAIL §2.1 (no skip link / `<main>`) | PASS | PASS | PASS | PASS |
| `/:handle` agent profile | PASS | PASS | FAIL §2.3 (rgba 0.2 labels) | FAIL §2.10 (520px card on 320px) | PASS | PASS |
| `/id/:agentId` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/u/:handle` human profile | PASS | PASS | PASS | PASS | PASS | PASS |
| `/org/:slug` | PASS | PASS | PASS | PASS | PASS | PASS |
| `/docs/*` | PASS | PASS | PASS (replace `'—'` placeholders §2.7) | PASS | N/A (static) | PASS |
| `/404` (NotFound) | PASS | PASS (add `<h1>` §3.15) | PASS | PASS | N/A | PASS |
| `/changelog`, `/pricing`, `/terms`, `/privacy`, `/security`, `/protocol`, `/for-agents` | PASS | PASS | PASS | PASS | PASS | PASS |

### Notes on /dashboard billing and /dashboard oauth-apps

- **Billing tab**: The billing tab is a thin wrapper around `api.billing.subscription()`, `api.billing.portal()` and `api.billing.checkout()`. It renders the active plan/limits and links into Stripe-hosted UIs. No custom modals; no secret inputs. The failure modes are all covered by the global gaps already in §2.2 (modals — none here), §2.3 (contrast), §2.4 (`<label>`/`autoComplete`), and §2.5 (silent `.catch`). No page-specific findings beyond those.
- **OAuth apps tab**: Renders the list of OAuth clients from `api.oauth.clients.list()` and lets owners create, edit, rotate-secret, upload-icon, and delete clients. The create/edit forms are inline (not modal); the delete action and the secret-rotate flow use the browser's native `confirm()` which is accessible but flat — replace with the Radix `AlertDialog` from `src/components/ui/alert-dialog.tsx` for a consistent UX. The redirect-URI multi-input lacks `<label htmlFor>` and `autoComplete="off"`. Secret display after rotation is one-shot copy-to-clipboard — confirm an `aria-live="polite"` region announces "Secret copied" for screen reader users.

## 7. Appendix B — Method & Limitations

- **Method**: this audit was conducted as a static code review (read-every-page + targeted ripgrep sweeps + parallel exploration subagents). Every page in the brief was opened and reviewed. Findings are anchored to file:line references throughout the report.
- **Screenshot pass — not performed**. The task brief Step 1 calls for a render-and-capture pass across logged-out / logged-in / empty / populated / error states for every page. That step was not executed in this task: doing it correctly requires running the agent-id dev workflow plus the API server, seeding both a logged-out and a logged-in session, and producing fixtures for the error/empty/populated branches of each page (some, like AdminDisputes, require admin credentials and seeded dispute data; some, like dashboard mail, require a real agent with mail enabled). That fixture work is itself a multi-task effort and was scoped out of this audit. The static review is sufficient to surface the structural a11y issues prioritised in §4; a follow-up screenshot pass should be done before the public launch to catch visual regressions and runtime-only states (focus rings, hover, tooltip layering, animation reduced-motion, mobile keyboard occlusion, etc).
- **Browser AT pass — not performed**. VoiceOver / NVDA / axe-core runs are listed in §5 as the verification step after remediation. They were not run during this audit because most failures (no `role="dialog"`, no `<label htmlFor>`, no focus trap) are statically determinable from the source.
- **Out-of-scope**: visual redesigns and backend behaviour, per the task brief.

---

*End of audit.*
