# tournaments-leaderboard Specification

> **API removed in change `remove-dead-surface` (2026-10-18)** — the `pages.leaderboard` procedure (`pages` router) was deleted.

> **Status: removed from the web UI on 2026-10-07** (`/tournaments` is gone; nothing in the API serves it). Requirements below are kept as the historical record.

## Purpose
Read-only tournament leaderboard page — the efhub `/tournaments` equivalent. No live integration this phase; rankings sourced from seeded data.
## Requirements
### Requirement: Tournament Leaderboard Display
The system MUST serve `/tournaments` displaying a leaderboard table with team name, points, and rank columns, with a Discord registration link.

#### Scenario: Viewing leaderboard
- **WHEN** a visitor navigates to `/tournaments`
- **THEN** the page renders a ranked table of teams with points, and a "Register via Discord" external link.

