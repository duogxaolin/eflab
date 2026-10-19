"use client";
// Small building blocks of the admin pages (openspec change admin-sync-worker):
// status badge, a button that stays focusable while unusable and shows why,
// notices, the tab-visibility hook behind the 3-second polling.
import { useId, useSyncExternalStore, type ReactNode } from "react";
import type { SyncStatus } from "@eflab/shared";
import { STATUS_BADGE_CLASS, STATUS_LABELS } from "./run-display";

export function StatusBadge({ status }: { status: SyncStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${STATUS_BADGE_CLASS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};

/** true while the tab is visible (always true during server rendering). */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
}

/** Poll interval of a query that shows runs: 3 s while one is queued / running and the tab is visible. */
export const ACTIVE_POLL_MS = 3_000;

const BUTTON_TONE = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] font-bold hover:brightness-110 aria-disabled:hover:brightness-100",
  secondary: "button--secondary",
  danger:
    "border border-[var(--color-accent-danger)]/60 bg-[var(--color-accent-danger)]/10 text-[var(--color-accent-danger)] hover:bg-[var(--color-accent-danger)]/20",
} as const;

/**
 * A button that, while unusable, keeps its focus and its place in the Tab order
 * (`aria-disabled`, clicks ignored) and shows the reason as visible text linked
 * with `aria-describedby` — so focus can return to it after a dialog and a
 * screen reader hears why it does nothing.
 */
export function ActionButton({
  children,
  onClick,
  disabledReason,
  busy = false,
  tone = "secondary",
  hint,
  haspopup = false,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  /** Why the button cannot be used now; null / undefined = usable. */
  disabledReason?: string | null;
  busy?: boolean;
  tone?: keyof typeof BUTTON_TONE;
  /** Visible help shown while the button is usable. */
  hint?: string;
  haspopup?: boolean;
  className?: string;
}) {
  const noteId = useId();
  const unusable = Boolean(disabledReason) || busy;
  const note = disabledReason || hint;
  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
      <button
        type="button"
        aria-disabled={unusable || undefined}
        aria-busy={busy || undefined}
        aria-describedby={note ? noteId : undefined}
        aria-haspopup={haspopup ? "dialog" : undefined}
        onClick={() => {
          if (!unusable) onClick();
        }}
        className={`button button--md w-full gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${BUTTON_TONE[tone]}`}
      >
        {children}
      </button>
      {note && (
        <p
          id={noteId}
          className={`text-[11px] leading-snug ${disabledReason ? "text-[var(--color-accent-warn)]" : "text-[var(--color-text-dim)]"}`}
        >
          {note}
        </p>
      )}
    </div>
  );
}

const NOTICE_TONE = {
  warn: "border-[var(--color-accent-warn)]/50 bg-[var(--color-accent-warn)]/10",
  danger: "border-[var(--color-accent-danger)]/50 bg-[var(--color-accent-danger)]/10",
  info: "border-[var(--color-accent-secondary)]/50 bg-[var(--color-accent-secondary)]/10",
} as const;

export function Notice({
  tone,
  title,
  icon,
  children,
  role,
  testId,
}: {
  tone: keyof typeof NOTICE_TONE;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  role?: "alert" | "status";
  testId?: string;
}) {
  return (
    <section role={role} data-testid={testId} className={`min-w-0 rounded-xl border p-4 ${NOTICE_TONE[tone]}`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        {icon}
        {title}
      </h2>
      <div className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
        {children}
      </div>
    </section>
  );
}

/** Panel surface with an uppercase micro-label heading (ui-dna headers). */
export function Panel({
  title,
  children,
  className = "",
  headingId,
  actions,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  headingId?: string;
  actions?: ReactNode;
}) {
  const fallbackId = useId();
  const id = headingId ?? fallbackId;
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
