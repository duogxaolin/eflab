"use client";
import Link from "next/link";
import type { Route } from "next";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

export type FooterLink =
  | { href: Route; label: string; external?: false }
  | { href: string; label: string; external: true };

/**
 * One footer link column. From lg it is a plain heading over its links;
 * below lg the heading is a disclosure button (`aria-expanded`,
 * `aria-controls`) and the list is collapsed until it is opened. The list is
 * hidden with `max-lg:hidden` (not the `hidden` attribute, which Tailwind's
 * preflight forces to display:none at every width).
 */
export function FooterLinkColumn({ title, links }: { title: string; links: readonly FooterLink[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <nav aria-label={title} className="min-w-0 border-b border-[var(--color-line-separator)] lg:border-0">
      <h3 className="mb-5 hidden text-base font-semibold text-white lg:block">{title}</h3>
      <h3 className="m-0 lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent p-0 text-left text-[15px] font-medium text-white"
        >
          {title}
          <ChevronDown
            className={`size-4 shrink-0 text-[var(--color-text-secondary)] transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </h3>
      <ul id={listId} className={`m-0 flex list-none flex-col gap-3 p-0 text-sm leading-5 max-lg:gap-2 max-lg:pb-4 ${open ? "" : "max-lg:hidden"}`}>
        {links.map((l) => (
          <li key={l.href}>
            {l.external ? (
              <a className="efb-footer-link" href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ) : (
              <Link className="efb-footer-link" href={l.href}>
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
