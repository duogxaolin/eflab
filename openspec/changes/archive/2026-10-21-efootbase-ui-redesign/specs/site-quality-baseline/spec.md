## MODIFIED Requirements

### Requirement: Keyboard and Screen-Reader Access
Card tiles SHALL be keyboard-focusable links (or buttons) with accessible names; filter popovers SHALL expose expanded state and close on Escape with focus returned; the search palette, the compare picker, filter dialogs, bottom sheets and the manager drawer SHALL be modal dialogs with a name, focus trap, Escape to close and focus restoration; carousels SHALL pause on focus, when the tab is hidden, and when reduced motion is requested, and SHALL offer a pause control; hover and tab-bar motion SHALL be disabled under reduced motion.

#### Scenario: Keyboard-only navigation
- **WHEN** a keyboard user presses Tab on `/players`
- **THEN** focus reaches each card, shows a visible focus style, and Enter opens the detail page.

#### Scenario: Reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** carousels do not auto-advance and cards do not animate on hover.
