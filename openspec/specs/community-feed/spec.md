# community-feed Specification

## Purpose
Community feed with text/image/player-card-share posts, likes, comments, and region/country filtering — the efhub `/community` equivalent.
## Requirements
### Requirement: Post Creation
Authenticated users MUST be able to create feed posts containing text, optional image upload, and an optional player card reference (share a card into the feed).

#### Scenario: Sharing a player card to feed
- **WHEN** an authenticated user clicks "Post to Feed" on a player detail page
- **THEN** a `Post` record is created linking the player card ID, and the post appears in the community feed with a card preview thumbnail.

### Requirement: Feed with Region Filter
The `/community` page MUST list posts in reverse-chronological order, filterable by author region (Europe, Americas, Asia & Pacific, Middle East & Africa) and country, with pagination.

#### Scenario: Filtering feed by region
- **WHEN** a visitor selects region "Asia & Pacific" on the community page
- **THEN** only posts authored by users whose `region` field is "Asia & Pacific" are displayed, paginated 20 per page.

### Requirement: Likes and Comments
Authenticated users MUST be able to like and comment on feed posts. Like counts display inline.

#### Scenario: Liking a post
- **WHEN** an authenticated user clicks the like button on a post
- **THEN** a `PostLike` record is created (or removed if already liked), and the like count toggles.

