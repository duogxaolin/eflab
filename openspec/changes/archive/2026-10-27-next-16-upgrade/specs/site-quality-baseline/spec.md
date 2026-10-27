## MODIFIED Requirements

### Requirement: Restricted Image Hosts and Security Headers
The web app SHALL NOT expose the Next image optimiser (nothing uses `next/image`; cards are plain `<img>` from the image host): `images.unoptimized` is set and `/_next/image` answers a 4xx error for every URL, including one on the configured image host; it SHALL send baseline security headers (frame-ancestors/X-Frame-Options, nosniff, referrer policy), and SHALL use an absolute tracing root.

#### Scenario: Arbitrary host
- **WHEN** `/_next/image?url=https://example.com/x.png` is requested
- **THEN** the response is a 4xx error.

#### Scenario: Optimiser disabled
- **WHEN** `/_next/image?url=<an R2 card image URL>&w=256&q=75` is requested
- **THEN** the response is a 4xx error, and no page of the app loads an image through `/_next/image`.
