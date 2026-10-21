## MODIFIED Requirements

### Requirement: Keyboard and Screen-Reader Access
Card tiles SHALL be keyboard-focusable links (or buttons) with accessible names; filter popovers SHALL expose expanded state and close on Escape with focus returned; the search palette, the compare picker, filter dialogs, bottom sheets and the manager drawer SHALL be modal dialogs with a name, focus trap, a single Escape to close (also when a search field inside holds text) and focus restoration; carousels and pack rows SHALL NOT auto-advance and SHALL offer previous/next controls reachable by keyboard; content that appears on hover (tooltips, previews) SHALL also appear on keyboard focus, SHALL be dismissable with Escape, SHALL stay open while the pointer is over it, and SHALL be reachable by tap on touch devices; information SHALL NOT be available only through a `title` attribute; hover and tab-bar motion SHALL be disabled under reduced motion.

#### Scenario: Keyboard-only navigation
- **WHEN** a keyboard user presses Tab on `/players`
- **THEN** focus reaches each card, shows a visible focus style, and Enter opens the detail page.

#### Scenario: Reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** carousels do not auto-advance, cards do not animate on hover, and drawers and sheets appear without a slide.
