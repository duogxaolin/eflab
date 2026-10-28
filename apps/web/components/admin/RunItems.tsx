"use client";
// "What was downloaded" on the run page (openspec change admin-sync-live-progress,
// design D4–D6; data-sync-worker "Downloaded Items Record"): the run's record as
// `admin.runs.get` returns it — New cards, Changed cards and the image groups,
// each a native disclosure (<details>, keyboard-operable) with its count, its
// first rows (≤ 50: cards with their name, overall, position and type joined
// from the catalogue and a link to the card page, the ids of cards no longer in
// the catalogue gathered in one collapsible line; image paths; failures with
// their reason class), "None" for an empty group, how many of the listed
// entries are not shown here and how many the record does not list at all
// (every list keeps the newest 2,000 with the true total).
import Link from "next/link";
import type { ReactNode } from "react";
import type { SyncRunCardRowDTO, SyncRunDTO, SyncRunItemGroupDTO } from "@eflab/shared";
import { CARD_TYPE_LABELS } from "@eflab/shared/constants";
import { reasonLabel } from "./run-display";

const n = (v: number) => v.toLocaleString("en-US");

function GroupFooter({ group }: { group: SyncRunItemGroupDTO<unknown> }) {
  const notShown = group.listed - group.rows.length;
  const notListed = group.total - group.listed;
  if (notShown <= 0 && notListed <= 0) return null;
  return (
    <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
      {notShown > 0 ? `${n(notShown)} more in the record, not shown here (the page shows the first ${n(group.rows.length)}).` : ""}
      {notShown > 0 && notListed > 0 ? " " : ""}
      {notListed > 0 ? `${n(notListed)} more not listed — the record keeps the newest ${n(group.listed)} of ${n(group.total)}.` : ""}
    </p>
  );
}

function Group<R>({
  title,
  help,
  group,
  testId,
  defaultOpen,
  render,
  renderRows,
}: {
  title: string;
  help: string;
  group: SyncRunItemGroupDTO<R>;
  testId: string;
  defaultOpen?: boolean;
  render?: (row: R) => ReactNode;
  /** Replaces the plain list (card groups: one line for the cards no longer in the catalogue). */
  renderRows?: (rows: R[]) => ReactNode;
}) {
  return (
    <details className="group min-w-0 border-t border-[var(--color-line-separator)] py-2 first:border-t-0" data-testid={testId} data-total={group.total} open={defaultOpen && group.total > 0 ? true : undefined}>
      <summary className="flex min-h-9 pointer-coarse:min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 text-sm text-white">
          {title} <span className="font-mono text-[var(--color-text-secondary)] tabular-nums">({n(group.total)})</span>
        </span>
        <span aria-hidden className="shrink-0 text-xs text-[var(--color-text-secondary)] transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ▸
        </span>
      </summary>
      <div className="min-w-0 px-1 pt-1">
        <p className="mb-1.5 text-[11px] text-[var(--color-text-dim)]">{help}</p>
        {group.total === 0 ? (
          <p className="text-xs text-[var(--color-text-secondary)]">None</p>
        ) : renderRows ? (
          renderRows(group.rows)
        ) : (
          <ul className="min-w-0 space-y-1">{group.rows.map((r, i) => <li key={i} className="min-w-0">{render?.(r)}</li>)}</ul>
        )}
        <GroupFooter group={group as SyncRunItemGroupDTO<unknown>} />
      </div>
    </details>
  );
}

type CatalogueCardRow = SyncRunCardRowDTO & { baseId: string; name: string };
const inCatalogue = (row: SyncRunCardRowDTO): row is CatalogueCardRow => row.baseId !== null && row.name !== null;

/**
 * A card group's rows: the cards found in the catalogue one per line, then ONE
 * collapsible line "N not in the catalogue now" whose ids open on demand (a
 * record of a run whose cards were later removed would otherwise be a page of
 * bare ids — verify suggestion S3).
 */
function CardRows({ rows }: { rows: SyncRunCardRowDTO[] }) {
  const found = rows.filter(inCatalogue);
  const missing = rows.filter((r) => !inCatalogue(r));
  return (
    <ul className="min-w-0 space-y-1">
      {found.map((r, i) => (
        <li key={i} className="min-w-0">
          <CardRow row={r} />
        </li>
      ))}
      {missing.length > 0 ? (
        <li className="min-w-0" data-testid="items-cards-missing" data-count={missing.length}>
          <details className="group/missing min-w-0">
            <summary className="inline-flex min-h-7 pointer-coarse:min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md text-xs text-[var(--color-text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="transition-transform group-open/missing:rotate-90 motion-reduce:transition-none">
                ▸
              </span>
              {n(missing.length)} not in the catalogue now
            </summary>
            <p className="mt-1 font-mono text-[11px] text-[var(--color-text-secondary)] [overflow-wrap:anywhere]" data-testid="items-cards-missing-ids">
              {missing.map((r) => r.id).join(", ")}
            </p>
          </details>
        </li>
      ) : null}
    </ul>
  );
}

function CardRow({ row }: { row: CatalogueCardRow }) {
  const facts = [
    row.overall !== null ? `${row.overall} OVR` : null,
    row.maxOverall !== null ? `max ${row.maxOverall}` : null,
    row.position,
    row.cardType ? CARD_TYPE_LABELS[row.cardType] : null,
  ].filter(Boolean);
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
      <Link
        href={`/players/${row.baseId}/${row.id}`}
        className="font-semibold text-white underline-offset-2 hover:text-[var(--color-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] [overflow-wrap:anywhere]"
      >
        {row.name}
      </Link>
      <span className="text-[var(--color-text-secondary)] tabular-nums">{facts.join(" · ")}</span>
      <span className="font-mono text-[11px] text-[var(--color-text-dim)]">{row.id}</span>
    </p>
  );
}

const Path = ({ path }: { path: string }) => <p className="font-mono text-[11px] text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">{path}</p>;

function Failure({ row }: { row: { path: string; reason: string } }) {
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-mono text-[11px] text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">{row.path}</span>
      <span className="rounded-md border border-[var(--color-line-active)] px-1.5 py-px text-[11px] text-white">
        {reasonLabel(row.reason)} <span className="font-mono text-[var(--color-text-dim)]">{row.reason}</span>
      </span>
    </p>
  );
}

export function RunItems({ run }: { run: Pick<SyncRunDTO, "items" | "itemsInvalid" | "status" | "kind"> }) {
  const active = run.status === "QUEUED" || run.status === "RUNNING";
  if (run.itemsInvalid) {
    return <p className="text-xs text-[var(--color-accent-warn)]">The stored record did not match the expected shape and is withheld.</p>;
  }
  const it = run.items;
  if (!it) {
    return (
      <p className="text-xs text-[var(--color-text-secondary)]">
        {run.kind === "CHECK"
          ? "A check downloads nothing."
          : active
            ? "Recorded once the run has compared the cards — written before its catalogue write and again when it ends."
            : "This run recorded no download list (runs before this record existed, or one that stopped before comparing the cards)."}
      </p>
    );
  }
  return (
    <div className="min-w-0" data-testid="run-items">
      <Group title="New cards" help="Cards that were not in the database, newest first — linked to their card page." group={it.cards.new} testId="items-cards-new" defaultOpen renderRows={(rows) => <CardRows rows={rows} />} />
      <Group title="Changed cards" help="Cards whose stored values changed, newest first." group={it.cards.changed} testId="items-cards-changed" defaultOpen renderRows={(rows) => <CardRows rows={rows} />} />
      <Group title="Images downloaded" help="Image files fetched from the source (new to the bucket or different from it)." group={it.images.downloaded} testId="items-images-downloaded" render={(p) => <Path path={p} />} />
      <Group title="Images overwritten" help="Downloads that replaced a bucket object with different content — raise the image version." group={it.images.overwritten} testId="items-images-overwritten" render={(p) => <Path path={p} />} />
      <Group title="Images replaced (unverified)" help="Downloads that may have replaced a bucket object whose ETag is not a content hash." group={it.images.unverified} testId="items-images-unverified" render={(p) => <Path path={p} />} />
      <Group
        title="Images not stored"
        help="Images that could not be fetched, with the reason class. Errors and refusals are counted in “Images failed” and retried by the next run; an image the source does not have (HTTP 404) is listed here only."
        group={it.images.failed}
        testId="items-images-failed"
        render={(e) => <Failure row={e} />}
      />
      <Group title="Images uploaded" help="Files uploaded to the image bucket." group={it.images.uploaded} testId="items-images-uploaded" render={(p) => <Path path={p} />} />
      <Group title="Uploads that failed" help="Files the upload could not store, with the reason class — their cards are compared again by the next run." group={it.images.uploadFailed} testId="items-images-upload-failed" render={(e) => <Failure row={e} />} />
    </div>
  );
}
