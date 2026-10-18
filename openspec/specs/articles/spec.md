# articles Specification

> **API removed in change `remove-dead-surface` (2026-10-18)** — the `pages` router, the MDX article content and the `gray-matter` / `next-mdx-remote` dependencies were deleted; nothing in the repository serves articles any more.

> **Status: removed from the web UI on 2026-10-07** (`/articles` routes and `lib/articles.ts` deleted; eflab follows efootbase's 4-page scope). The `pages` API router remains unused. Requirements below are kept as the historical record.

## Purpose
MDX-based editorial and datamine-leak article pages with category filter — the efhub `/articles` equivalent.
## Requirements
### Requirement: Article Directory
The system MUST serve `/articles` listing articles in reverse-chronological order with category filter chips (Analysis, Game Mechanics, Player Review, Short Thoughts, News, Guide).

#### Scenario: Filtering by category
- **WHEN** a visitor clicks the "Game Mechanics" category chip
- **THEN** only articles with `category = "game_mechanics"` are displayed.

### Requirement: Article Detail Page
The system MUST serve `/articles/[slug]` rendering MDX content with front-matter metadata (title, excerpt, author, date, cover image).

#### Scenario: Reading an article
- **WHEN** a visitor navigates to `/articles/tactical-notes-crossing-runs`
- **THEN** the page renders the article title, author, publish date, cover image, and MDX body content with syntax highlighting.

