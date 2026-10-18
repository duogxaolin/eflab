# site-quality-baseline Specification

## Purpose
Sets the baseline for accessibility, responsiveness, performance, error handling, branding, API robustness and configuration that the eflab web app and API must meet to be a usable standalone product.
## Requirements
### Requirement: eflab Branding
The site SHALL present itself as eflab: page titles, social metadata, header logo and footer SHALL NOT use the efootbase name, icon or build identifier, and any displayed build stamp SHALL come from this repository's build or be hidden.

#### Scenario: Title and footer
- **WHEN** any page is loaded
- **THEN** the document title, Open Graph title and footer contain "eFootLab" (or the chosen eflab name) and contain no "eFootBase" string and no "8d9068b" build id.

### Requirement: No Horizontal Overflow on Phones
At viewport widths from 320 to 480 px, no page SHALL cause horizontal page scrolling, and the Pitch Map, pagination bar, compare bars and popovers SHALL fit the viewport.

#### Scenario: 375 px viewport
- **WHEN** the home, players, detail and compare pages are opened at 375 px width
- **THEN** `document.documentElement.scrollWidth` equals the viewport width on every page.

### Requirement: Responsive Hand-Written Styles Respect Utilities
Hand-written component styles SHALL NOT override Tailwind utility classes applied in markup; responsive visibility utilities SHALL work.

#### Scenario: Mobile-only search button
- **WHEN** the viewport is 1024 px wide
- **THEN** the mobile-only search icon button in the header is not displayed.

### Requirement: Lazy Card Images
Card face images SHALL load lazily and asynchronously decode, SHALL declare their dimensions, and a page with many cards SHALL NOT download all images before they approach the viewport.

#### Scenario: Packs page first load
- **WHEN** `/packs` is opened and the page is not scrolled
- **THEN** fewer than 40 card-face image requests are made, and total image transfer is under 6 MB.

### Requirement: Keyboard and Screen-Reader Access
Card tiles SHALL be keyboard-focusable links (or buttons) with accessible names; filter popovers SHALL expose expanded state and close on Escape with focus returned; the search palette and compare picker SHALL be modal dialogs with a name, focus trap, Escape to close and focus restoration; carousels SHALL pause on focus, when the tab is hidden, and when reduced motion is requested, and SHALL offer a pause control; tilt effects SHALL be disabled under reduced motion.

#### Scenario: Keyboard-only navigation
- **WHEN** a keyboard user presses Tab on `/players`
- **THEN** focus reaches each card, shows a visible focus style, and Enter opens the detail page.

#### Scenario: Reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** carousels do not auto-advance and cards do not tilt.

### Requirement: Debounced Search and Error States
Search inputs SHALL wait for typing to pause before querying, SHALL cancel superseded requests, and every data-driven page SHALL show an explicit error state with a retry action when a request fails; client errors (HTTP 4xx) SHALL NOT be retried automatically.

#### Scenario: Typing a name
- **WHEN** a user types "cristiano ronaldo" at normal speed in a search box
- **THEN** at most 3 search requests are sent, not one per keystroke.

#### Scenario: API unreachable
- **WHEN** the API is down
- **THEN** each page shows an error message with a retry button within 5 seconds, not an empty-result message.

### Requirement: Search Performance
A name search over the full catalogue SHALL complete in under 50 ms server-side for a typical query, using an index, and the home trending query SHALL NOT scan the full table on every request.

#### Scenario: Search latency
- **WHEN** the search endpoint is called with "ronaldo" against 50,694 players
- **THEN** the query plan uses an index scan and the server-side execution time is under 50 ms.

### Requirement: API Robustness
The API SHALL NOT fail every request because of one malformed cookie; SHALL return client errors (400/401/404/409) with typed messages instead of HTTP 500 for expected failures and out-of-range identifiers; SHALL hide stack traces and internal paths unless explicitly running in development; SHALL mark session cookies Secure outside development; SHALL cap the number of procedures per batched request; and SHALL take allowed web origins from configuration.

#### Scenario: Malformed cookie
- **WHEN** a request carries `Cookie: promo=50%off`
- **THEN** the API responds normally and ignores the undecodable cookie.

#### Scenario: Out-of-range id
- **WHEN** a client requests a player with a 20-digit id
- **THEN** the response is HTTP 400 (or a not-found result), never 500.

#### Scenario: Production errors
- **WHEN** the API runs with `NODE_ENV=production` and a procedure fails
- **THEN** the response body contains no stack trace, absolute path or database error text.

#### Scenario: Batch limit
- **WHEN** a client batches more procedures than the configured maximum in one request
- **THEN** the API rejects the request with a 4xx status.

### Requirement: Health Endpoint
The API SHALL expose `GET /health` returning HTTP 200 with database connectivity status, and the repository smoke test SHALL pass against a freshly refreshed database.

#### Scenario: Health check
- **WHEN** `GET /health` is called with the database reachable
- **THEN** the response is 200 with `status: "ok"`.

### Requirement: Safe Account Linking
Google sign-in SHALL link to an existing account by email only when Google reports the email as verified and the existing account's email is verified; otherwise it SHALL refuse to link. Error redirects SHALL target an existing page.

#### Scenario: Unverified local account
- **WHEN** a Google login uses an email that matches a local account whose email was never verified
- **THEN** the accounts are not merged and the user sees an error on an existing page.

### Requirement: Restricted Image Hosts and Security Headers
The web app SHALL only allow the image optimiser to fetch from configured hosts, SHALL send baseline security headers (frame-ancestors/X-Frame-Options, nosniff, referrer policy), and SHALL use an absolute tracing root.

#### Scenario: Arbitrary host
- **WHEN** `/_next/image?url=https://example.com/x.png` is requested
- **THEN** the response is a 4xx error.

### Requirement: Documented Environment Loading
The repository SHALL document and implement where `NEXT_PUBLIC_*` variables are read by the web app, so that changing the documented variable changes the built application, and documentation SHALL NOT claim a one-variable domain swap while absolute URLs are stored in the database.

#### Scenario: Changing the API URL
- **WHEN** the documented variable for the API URL is changed and the web app is rebuilt
- **THEN** the built client calls the new URL.

### Requirement: Accurate Project Documentation
CLAUDE.md, README.md, the UI DNA document, `.env.example`, the docs index and the OpenSpec specs SHALL describe the current implementation (seed behaviour, card rendering, theme tokens, bucket name, scripts, removed features) and SHALL NOT contain third-party API keys.

#### Scenario: Key scan
- **WHEN** tracked files are searched for the two previously committed third-party keys
- **THEN** no occurrence remains in the working tree.

#### Scenario: Stale claims
- **WHEN** CLAUDE.md states how seeding or card rendering works
- **THEN** the statement matches the code (non-idempotent seed unless refreshed, single-image card, zinc-and-lime theme).

### Requirement: Automated Checks
`pnpm test` SHALL run the progression engine tests and the API smoke test and SHALL exit non-zero when any assertion fails; `pnpm typecheck` SHALL pass.

#### Scenario: Failing assertion
- **WHEN** a progression test assertion fails
- **THEN** `pnpm test` exits with a non-zero status.

