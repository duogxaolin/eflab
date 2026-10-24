## MODIFIED Requirements

### Requirement: Keyboard and Screen-Reader Access
Card tiles SHALL be keyboard-focusable links (or buttons) with accessible names; filter popovers SHALL expose expanded state and close on Escape with focus returned; the search palette, the compare picker, filter dialogs, bottom sheets, the manager drawer and the second-booster drawer SHALL be modal dialogs with a name, focus trap, a single Escape to close (also when a search field inside holds text) and focus restoration; carousels and pack rows SHALL NOT auto-advance, and every card of a pack row SHALL be reachable by Tab, the row scrolling the focused card into view (the home pack rows have no previous/next buttons, as on the reference); content that appears on hover (tooltips, previews) SHALL also appear on keyboard focus, SHALL be dismissable with Escape, SHALL stay open while the pointer is over it, and SHALL be reachable by tap on touch devices; information SHALL NOT be available only through a `title` attribute; hover and tab-bar motion SHALL be disabled under reduced motion.

#### Scenario: Keyboard-only navigation
- **WHEN** a keyboard user presses Tab on `/players`
- **THEN** focus reaches each card, shows a visible focus style, and Enter opens the detail page.

#### Scenario: Reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** carousels do not auto-advance, cards do not animate on hover, and drawers and sheets appear without a slide.

#### Scenario: Pack row by keyboard
- **WHEN** a keyboard user tabs through a home pack row
- **THEN** every card of the row receives focus in order and each focused card is fully visible inside the row.
