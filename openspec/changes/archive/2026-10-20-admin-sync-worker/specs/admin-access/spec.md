## Purpose

Gives the site owner a private administration area with its own accounts, kept apart from visitor accounts, so that sync controls can be operated safely over the web.

## ADDED Requirements

### Requirement: Separate Admin Accounts
Admin accounts SHALL live in their own table with a unique user name of 3–32 characters from `a-z 0-9 _ . -`, a password hash, a creation time and an optional disabled time. They SHALL NOT use or require any visitor user, session or account row, and the visitor sign-in and its procedures SHALL be unchanged. A disabled admin SHALL NOT be able to sign in and its sessions SHALL stop working.

#### Scenario: Visitor session is not an admin session
- **WHEN** a request carries a valid visitor session cookie and no admin session
- **THEN** every admin procedure answers 401.

#### Scenario: Disabled admin
- **WHEN** an admin is disabled while signed in
- **THEN** its next admin request answers 401 and sign-in with its password fails with the generic message.

### Requirement: Password Handling
Passwords SHALL be at least 12 characters and be stored only as a salted scrypt hash whose parameters are recorded in the stored string, and verification SHALL use a constant-time comparison. A password SHALL never be written to a log, an error message, a response or a process argument list.

#### Scenario: Short password
- **WHEN** an account is created or a password is changed to fewer than 12 characters
- **THEN** the command fails and stores nothing.

#### Scenario: Stored value
- **WHEN** the admin table is read directly
- **THEN** no column contains the plain password, and two accounts with the same password have different hashes.

### Requirement: Admin Account Commands
The repository SHALL provide commands to create an admin, change its password and disable it. The password SHALL come from a hidden prompt or from an environment variable and SHALL NOT be accepted as a command-line argument. Creating a user name that exists SHALL fail without changing it.

#### Scenario: Create from environment
- **WHEN** `admin:create` runs with a new user name and the password variable set
- **THEN** one admin row exists and the command prints no password.

#### Scenario: Duplicate user name
- **WHEN** `admin:create` runs with an existing user name
- **THEN** it exits non-zero and the existing hash is unchanged.

### Requirement: Admin Sign-In And Session
Signing in with a valid user name and password SHALL set a session cookie holding a random token of at least 32 bytes that is HttpOnly, SameSite=Strict and Secure outside development, and the database SHALL store only a SHA-256 digest of the token. A session SHALL expire 12 hours after its last use and never later than 7 days after sign-in. Signing out SHALL delete the session. Sign-in failure SHALL always return the same message ("Wrong user name or password") and take comparable time whether or not the user name exists.

#### Scenario: Successful sign-in
- **WHEN** an admin signs in with the right password
- **THEN** the response sets the cookie with the required attributes and the database holds a digest, not the token.

#### Scenario: Wrong user name or wrong password
- **WHEN** a sign-in fails because of an unknown user name, and another fails because of a wrong password
- **THEN** both responses are identical in status and message.

#### Scenario: Expired session
- **WHEN** a session is idle for more than 12 hours or older than 7 days
- **THEN** the next admin request answers 401 and the session row is removed or ignored.

#### Scenario: Sign-out
- **WHEN** an admin signs out
- **THEN** the same cookie no longer authorises requests.

### Requirement: Brute-Force Protection
After 5 consecutive failed sign-ins for one account, the account SHALL refuse sign-in for 15 minutes even with the right password, and sign-in attempts SHALL also be limited per client address (20 attempts per 15 minutes). A successful sign-in SHALL reset the failure count. The lock-out response SHALL NOT reveal whether the account exists.

#### Scenario: Lock after five failures
- **WHEN** five wrong passwords are sent for one account and then the right one
- **THEN** the right password is refused with the generic message during the next 15 minutes.

#### Scenario: Concurrent attempts
- **WHEN** five wrong passwords and the right one are sent for one account at the same time (one batched request or parallel requests)
- **THEN** every attempt gets the generic message, no session is issued and the account is locked.

#### Scenario: Address limit
- **WHEN** one address makes 21 attempts in 15 minutes against different names
- **THEN** the 21st is refused with a rate-limit status.

### Requirement: CSRF Guard
Every state-changing admin request SHALL require the header `x-eflab-admin: 1` and an `Origin` that is in the configured web origins, and SHALL be refused with 403 otherwise.

#### Scenario: Missing header
- **WHEN** an authenticated admin request that changes data omits the custom header
- **THEN** the response is 403 and nothing changes.

#### Scenario: Foreign origin
- **WHEN** such a request carries an origin that is not configured
- **THEN** the response is 403.

### Requirement: Protected Admin API
Every admin procedure except sign-in SHALL answer 401 without a valid admin session. No admin response SHALL contain a password hash, a session token, a session digest, the efootbase key or an R2 credential, and admin responses SHALL be sent with `Cache-Control: no-store`.

#### Scenario: No session
- **WHEN** an admin procedure is called without a cookie
- **THEN** the response is 401 with a typed message and no data.

#### Scenario: No secret fields
- **WHEN** the run list, the configuration and the account information are read
- **THEN** none of the responses contains a field that holds a hash, token, key or credential.

### Requirement: Admin Pages Are Private And Usable
The admin pages SHALL be marked `noindex`, SHALL NOT be linked from the public navigation or sitemap, SHALL send `Cache-Control: no-store`, SHALL redirect an unauthenticated visitor to the sign-in page, and SHALL fit without horizontal scrolling from 320 to 1280 px with labelled controls that work from the keyboard.

#### Scenario: Unauthenticated visit
- **WHEN** `/admin` is opened without a session
- **THEN** the visitor lands on `/admin/login` and no admin data is in the response.

#### Scenario: Robots and navigation
- **WHEN** the public pages and any admin page are fetched
- **THEN** no public page links to `/admin` and every admin page carries a `noindex` directive.

#### Scenario: Phone width
- **WHEN** an admin page is shown at 320 px
- **THEN** there is no horizontal page scroll.
