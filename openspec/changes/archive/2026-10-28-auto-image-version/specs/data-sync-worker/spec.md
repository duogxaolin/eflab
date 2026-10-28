## MODIFIED Requirements

### Requirement: Overwritten Images Warning
When a run overwrites any existing card image, the dashboard and the run detail SHALL show how many were overwritten, and the worker SHALL raise the card-image version automatically as the `card-image-version` capability defines, so that visitors see the new images without anyone editing code or rebuilding the web app; the pages SHALL say the version was raised instead of asking for it. An image counts as overwritten only when the bucket object it replaces has a content-hash ETag that differs from the downloaded body; a downloaded body equal to the bucket object SHALL be dropped, and a replacement of a bucket object whose ETag is not a content hash SHALL be counted separately as unverified, not as overwritten.

#### Scenario: Warning shown
- **WHEN** a finished run reports 12 overwritten card images
- **THEN** the run detail and the dashboard show that count, and the run detail says the image version was raised automatically, with no instruction to raise it by hand.
