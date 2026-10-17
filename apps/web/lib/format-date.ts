// Date formatting for catalogue dates (bundle releases, card release dates).
// Always UTC so every viewer sees the same calendar day (catalog-browsing-parity
// "Dates Are Timezone-Stable"): a 2026-10-05 03:00 UTC release is "Oct 5, 2026"
// in Los Angeles too.
const UTC_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatUtcDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return UTC_DATE.format(d);
}
