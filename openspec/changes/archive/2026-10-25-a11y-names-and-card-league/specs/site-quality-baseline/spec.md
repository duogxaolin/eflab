## MODIFIED Requirements

### Requirement: Keyboard and Screen-Reader Access
Card tiles SHALL be keyboard-focusable links (or buttons) with accessible names; every link, button and tile SHALL satisfy WCAG 2.5.3 "Label in Name": its accessible name contains the text it shows on screen — each visible text run whole and in the order shown (a card tile's name starts with its visible overall and position, then the player name; the header search button's name is "Search players"; a skill tile's name follows the order of its visible runs — skill name, description, leader, card count; a compare "Add Player" slot's name contains "Add Player" and its visible hint); where a control's name is its own content (the header button, tiles whose visible runs cannot be joined into one string) it is not overridden with a separate label, the shortcut of the ⌘K button being exposed through `aria-keyshortcuts`; filter popovers SHALL expose expanded state and close on Escape with focus returned; the search palette, the compare picker, filter dialogs, bottom sheets, the manager drawer and the second-booster drawer SHALL be modal dialogs with a name, focus trap, a single Escape to close (also when a search field inside holds text) and focus restoration; carousels and pack rows SHALL NOT auto-advance, and every card of a pack row SHALL be reachable by Tab, the row scrolling the focused card into view (the home pack rows have no previous/next buttons, as on the reference); content that appears on hover (tooltips, previews) SHALL also appear on keyboard focus, SHALL be dismissable with Escape, SHALL stay open while the pointer is over it, and SHALL be reachable by tap on touch devices; information SHALL NOT be available only through a `title` attribute; hover and tab-bar motion SHALL be disabled under reduced motion.

#### Scenario: Keyboard-only navigation
- **WHEN** a keyboard user presses Tab on `/players`
- **THEN** focus reaches each card, shows a visible focus style, and Enter opens the detail page.

#### Scenario: Reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** carousels do not auto-advance, cards do not animate on hover, and drawers and sheets appear without a slide.

#### Scenario: Pack row by keyboard
- **WHEN** a keyboard user tabs through a home pack row
- **THEN** every card of the row receives focus in order and each focused card is fully visible inside the row.

#### Scenario: Label in Name
- **WHEN** axe-core 4.14 runs with the rule `label-content-name-mismatch` enabled on home, `/players`, a player page, `/compare` (empty and filled), `/packs`, a pack page, `/wiki/skills`, a skill page, `/admin/login` and the 404 page at 1440 and 390 px
- **THEN** it reports 0 violations of that rule and of every other WCAG 2.0 / 2.1 A–AA rule.
