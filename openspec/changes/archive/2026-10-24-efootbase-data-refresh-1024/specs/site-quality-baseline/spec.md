## MODIFIED Requirements

### Requirement: Search Performance
A name search over the full catalogue SHALL complete in under 50 ms server-side for a typical query, using an index, and the home trending query SHALL NOT scan the full table on every request.

#### Scenario: Search latency
- **WHEN** the search endpoint is called with "ronaldo" against the full catalogue (50,694 players on the 2026-10-18 data)
- **THEN** the query plan uses an index scan and the server-side execution time is under 50 ms.
