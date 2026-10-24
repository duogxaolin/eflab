// The remembered manager of the player pages (change efootbase-function-parity,
// design D3; spec "Remembered Manager"): the id of the manager last chosen in
// a player page's picker, kept in this browser so every card opens with it.
// Written only when a manager is chosen; removed when it is deselected
// (chosen again, "Clear") or the Manager Proficiency control is moved. A
// `mgr` link selects a manager without storing it, and the compare page never
// reads or writes it. Storage may be unavailable or throw (private mode,
// blocked site data): every access is guarded and a failure means "no
// remembered manager", never an error.

/** localStorage key (eFootLab's own; the value is a picker manager id). */
export const REMEMBERED_MANAGER_KEY = "eflab:selected-manager";

/** The stored manager id, or null (none, or storage unavailable). */
export function readRememberedManager(): string | null {
  try {
    return window.localStorage.getItem(REMEMBERED_MANAGER_KEY);
  } catch {
    return null;
  }
}

/** Store the chosen manager's id. */
export function rememberManager(id: string): void {
  try {
    window.localStorage.setItem(REMEMBERED_MANAGER_KEY, id);
  } catch {
    // Storage unavailable: the choice applies to this page only.
  }
}

/** Forget the stored manager. */
export function forgetRememberedManager(): void {
  try {
    window.localStorage.removeItem(REMEMBERED_MANAGER_KEY);
  } catch {
    // Storage unavailable: nothing was stored.
  }
}
