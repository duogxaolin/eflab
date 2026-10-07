## Purpose

Pro subscription landing page and build gating scaffold (schema fields `isPro`/`proUntil` only — no payment processing this phase).

## ADDED Requirements

### Requirement: Pro Landing Page
The system MUST serve `/pro` describing the Pro tier benefits (ad-free, Pro Builds access, advanced filters) with price display but no active payment button (Coming Soon).

#### Scenario: Visiting Pro page
- **WHEN** a visitor navigates to `/pro`
- **THEN** the page renders Pro benefits, a "Coming Soon" badge, and does not invoke any payment provider.

### Requirement: Pro Build Gating
The system MUST filter the "Pro Builds" tab on player detail pages to only show builds where `isPro = true`, and display a Pro lock badge to non-Pro users.

#### Scenario: Non-Pro user viewing Pro builds
- **WHEN** a non-Pro user opens the "Pro Builds" tab on a player card
- **THEN** the tab displays a lock icon and "Upgrade to Pro" CTA instead of the build list.
