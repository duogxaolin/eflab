// Labels and formatting for the admin pages (openspec change admin-sync-worker).
// English labels for every run kind, trigger, status and statistic — the UI
// never shows the raw enum names or the camelCase statistic keys.
import type { SyncCheckResult, SyncKind, SyncRunStats, SyncRunSummaryDTO, SyncStatus, SyncTrigger } from "@eflab/shared";
import type { SyncProgressCounter } from "@eflab/shared/sync-records";

export const KIND_LABELS: Record<SyncKind, string> = {
  CHECK: "API check",
  INCREMENTAL: "Incremental sync",
  FULL: "Full sync",
};

export const TRIGGER_LABELS: Record<SyncTrigger, string> = {
  SCHEDULE: "Scheduled",
  MANUAL: "Manual",
};

export const STATUS_LABELS: Record<SyncStatus, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  OK: "OK",
  FAILED: "Failed",
  BLOCKED: "Blocked",
  CANCELLED: "Cancelled",
};

/** Badge colours by status, from the palette tokens (ui-dna: lime ok, cyan informational, amber caution, red error). */
export const STATUS_BADGE_CLASS: Record<SyncStatus, string> = {
  QUEUED: "border-[var(--color-line-active)] bg-[var(--color-elevated)] text-[var(--color-text-secondary)]",
  RUNNING:
    "border-[var(--color-accent-secondary)]/50 bg-[var(--color-accent-secondary)]/15 text-[var(--color-accent-secondary)]",
  OK: "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
  FAILED: "border-[var(--color-accent-danger)]/50 bg-[var(--color-accent-danger)]/15 text-[var(--color-danger-soft-foreground)]",
  BLOCKED: "border-[var(--color-accent-warn)]/50 bg-[var(--color-accent-warn)]/15 text-[var(--color-accent-warn)]",
  CANCELLED: "border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-text-dim)]",
};

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-19 14:03:22 UTC" (always UTC — the schedule is UTC too); "—" for null. */
export function formatUtcDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}:${pad(d.getUTCSeconds())} UTC`;
}

/** "1 h 02 min", "3 min 05 s", "850 ms". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${pad(s % 60)} s`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
}

/** "12 s ago", "4 min ago", "3 h ago", "in 2 h" — relative to `now`. */
export function formatRelative(iso: string | null | undefined, now: number): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = now - t;
  const abs = Math.abs(diff);
  const unit =
    abs < 60_000
      ? `${Math.max(0, Math.round(abs / 1000))} s`
      : abs < 3_600_000
        ? `${Math.round(abs / 60_000)} min`
        : abs < 172_800_000
          ? `${Math.round(abs / 3_600_000)} h`
          : `${Math.round(abs / 86_400_000)} days`;
  return diff >= 0 ? `${unit} ago` : `in ${unit}`;
}

/** Duration of a run: the recorded statistic, else finished − started. */
export function runDurationMs(run: Pick<SyncRunSummaryDTO, "stats" | "startedAt" | "finishedAt">): number | null {
  if (typeof run.stats.durationMs === "number") return run.stats.durationMs;
  if (run.startedAt && run.finishedAt) return new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  return null;
}

type CountKey = Exclude<keyof SyncRunStats, "check" | "imagesPendingIds" | "imagesChecked">;

/** Statistic rows in display order, with the label and a one-line explanation (also the row tooltip). */
export const STAT_ROWS: ReadonlyArray<{ key: CountKey; label: string; help: string; format?: (v: number) => string }> = [
  { key: "pages", label: "Pages read", help: "Pages of the efootbase players list that were read." },
  { key: "requests", label: "Requests made", help: "HTTP requests sent to efootbase (data and images)." },
  { key: "cardsNew", label: "New cards", help: "Cards that were not in the database before this run." },
  { key: "cardsChanged", label: "Changed cards", help: "Cards already in the database whose stored values changed." },
  { key: "cardsUnchanged", label: "Unchanged cards", help: "Cards read again whose stored values did not change." },
  { key: "imagesDownloaded", label: "Images downloaded", help: "Card and emblem images downloaded from the efootbase CDN." },
  { key: "imagesUploaded", label: "Images uploaded", help: "Images uploaded to the R2 image bucket." },
  {
    key: "imagesOverwritten",
    label: "Images overwritten",
    help: "Uploads that replaced an existing card image on R2 — visitors see them only after the image version is raised.",
  },
  {
    key: "imagesUnverified",
    label: "Images replaced (unverified)",
    help: "Uploads that may have replaced a bucket object whose ETag is not a content hash — not counted as overwritten.",
  },
  { key: "imagesFailed", label: "Images failed", help: "Images that could not be downloaded or uploaded (also those of a third-party host that refused) — retried by the next run." },
  {
    key: "imagesPending",
    label: "Images left to check",
    help: "Cards whose images are still to be compared with the bucket (failed, skipped or not reached) — the next run compares them again.",
  },
  { key: "durationMs", label: "Duration", help: "Wall-clock time of the run.", format: (v) => formatDuration(v) },
];

/** Check-result rows (a check run's `stats.check`). */
export const CHECK_ROWS: ReadonlyArray<{ key: keyof SyncCheckResult; label: string; help: string }> = [
  { key: "answered", label: "Source answered", help: "Whether efootbase answered the request at all." },
  { key: "httpStatus", label: "HTTP status", help: "Status code of efootbase's answer." },
  { key: "challenge", label: "Bot challenge", help: "Whether the answer was a bot-check (HTML challenge) page." },
  { key: "responseMs", label: "Response time", help: "Time until efootbase answered." },
  { key: "newestReleaseAt", label: "Newest card at the source", help: "Release time of the newest card efootbase lists." },
  { key: "dbNewestReleaseAt", label: "Newest card in the database", help: "Release time of the newest card stored here when the check ran." },
  { key: "newerThanDb", label: "Source has newer cards", help: "Whether efootbase's newest card is newer than the database's newest." },
];

const yesNo = (v: boolean | null | undefined) => (v === null || v === undefined ? "—" : v ? "Yes" : "No");

export function formatCheckValue(key: keyof SyncCheckResult, check: SyncCheckResult): string {
  switch (key) {
    case "answered":
    case "challenge":
    case "newerThanDb":
      return yesNo(check[key]);
    case "httpStatus":
      return check.httpStatus === null ? "—" : String(check.httpStatus);
    case "responseMs":
      return check.responseMs === null ? "—" : `${check.responseMs} ms`;
    case "newestReleaseAt":
    case "dbNewestReleaseAt":
      return formatUtcDateTime(check[key]);
  }
}

/** One-line summary of a check result ("HTTP 200 · 182 ms · source has newer cards"). */
export function checkSummary(check: SyncCheckResult): string {
  if (!check.answered) return "efootbase did not answer";
  const parts = [check.httpStatus === null ? "no status" : `HTTP ${check.httpStatus}`];
  if (check.responseMs !== null) parts.push(`${check.responseMs} ms`);
  if (check.challenge) parts.push("bot challenge page");
  if (check.newerThanDb === true) parts.push("source has newer cards");
  else if (check.newerThanDb === false) parts.push("no newer cards");
  return parts.join(" · ");
}

// ---- Live progress and the downloaded-items record (openspec change admin-sync-live-progress) ----

/** Labels of the counters a progress snapshot carries (same wording as the statistics rows). */
export const COUNTER_LABELS: Readonly<Record<SyncProgressCounter, string>> = {
  cardsNew: "New cards",
  cardsChanged: "Changed cards",
  imagesDownloaded: "Images downloaded",
  imagesUploaded: "Images uploaded",
  imagesOverwritten: "Images overwritten",
  imagesFailed: "Images failed",
  requests: "Requests made",
};
export const COUNTER_ORDER: readonly SyncProgressCounter[] = ["cardsNew", "cardsChanged", "imagesDownloaded", "imagesUploaded", "imagesOverwritten", "imagesFailed", "requests"];

/** What one unit of a phase is ("45 of 120 images"). */
export function phaseUnit(phase: string): string {
  if (phase === "Downloading images" || phase === "Uploading images" || phase === "Comparing images") return "images";
  if (phase === "Comparing rows") return "rows";
  if (phase === "Reading pages") return "pages";
  return "steps";
}

/** Readable text of a failure reason class (the class itself is shown too). */
export function reasonLabel(reason: string): string {
  const m = /^http_(\d{3})$/.exec(reason);
  if (m) return m[1] === "404" ? "HTTP 404 — not at the source" : `HTTP ${m[1]}`;
  switch (reason) {
    case "timeout":
      return "Timed out";
    case "bad_signature":
      return "Not an image";
    case "too_large":
      return "Too large";
    case "host_refused":
      return "Image host refused";
    default:
      return "Other error";
  }
}

/** The instruction shown with every overwritten-images warning. */
export const IMAGE_VERSION_INSTRUCTION =
  "R2 serves card images with a one-year immutable cache, so browsers and the CDN keep showing the old images. Raise DEFAULT_IMAGE_VERSION in apps/web/lib/r2-images.ts (or set NEXT_PUBLIC_IMAGE_VERSION) and rebuild the web app so visitors see the new ones.";
