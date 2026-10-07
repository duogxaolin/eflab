## Purpose

Real authentication (email/password + Google OAuth) with Postgres-backed sessions, replacing the Phase 1 fake seed-user. All community mutations require authenticated sessions.

## ADDED Requirements

### Requirement: Email/Password Signup and Signin
The system MUST allow new users to register with email + password, and existing users to sign in, returning a session cookie. Passwords MUST be hashed (bcrypt/argon2). Sessions persist in Postgres `sessions` table.

#### Scenario: New user registration
- **WHEN** a visitor submits a valid email + password (min 8 chars) to the signup endpoint
- **THEN** the system creates a `User` record with hashed password, issues a session cookie, and redirects to the home page as an authenticated user.

#### Scenario: Duplicate email rejection
- **WHEN** a visitor registers with an email that already exists
- **THEN** the system returns a 409 conflict error and does not create a duplicate record.

### Requirement: Google OAuth Signin
The system MUST support "Sign in with Google" via OAuth 2.0, creating or linking the user account on first sign-in.

#### Scenario: First-time Google OAuth
- **WHEN** a visitor clicks "Sign in with Google" and Google returns a valid profile
- **THEN** the system creates a `User` record with the Google subject as the account identity (no password), issues a session, and redirects home.

### Requirement: Protected tRPC Procedures
The system MUST expose a `protectedProcedure` middleware that rejects unauthenticated calls with 401 and injects the authenticated `User` into the tRPC context for community mutations (voteTier, review, saveBuild, follow, post).

#### Scenario: Unauthenticated mutation attempt
- **WHEN** an unauthenticated client calls `community.voteTier`
- **THEN** the server returns a 401 UNAUTHORIZED tRPC error and does not write to the database.
