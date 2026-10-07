# user-profiles Specification

## Purpose
Public user profile pages, follow/follower graph, and user-scoped listings of builds, reviews, and tier votes.
## Requirements
### Requirement: Public Profile Page
The system MUST serve a public profile page at `/u/[username]` displaying the user's display name, avatar, region, country, follower count, following count, and tabs for their public builds, reviews, and tier votes.

#### Scenario: Viewing a user profile
- **WHEN** any visitor navigates to `/u/duo_dev`
- **THEN** the page renders the user's avatar, region badge, follower/following counts, and a tabbed list of their saved public builds with player card thumbnails.

### Requirement: Follow and Unfollow
Authenticated users MUST be able to follow and unfollow other users, and the target user's follower count MUST update atomically.

#### Scenario: Following a user
- **WHEN** an authenticated user clicks "Follow" on another user's profile
- **THEN** a `Follow` record is created (or no-op if already following), the target's `followersCount` increments, and the button toggles to "Following".

