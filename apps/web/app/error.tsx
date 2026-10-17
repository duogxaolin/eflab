"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Route-level error boundary: a server wrapper that could not reach the API
// (ApiUnavailableError) or any unexpected render error lands here with a
// Retry (`reset` re-renders the segment) instead of a blank page.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="p-12 text-center rounded-2xl bg-[var(--color-panel)] border border-[var(--color-line)] space-y-4">
      <AlertTriangle className="size-6 mx-auto text-[var(--color-accent-danger,#ef4444)]" aria-hidden />
      <h1 className="text-xl font-bold text-white">Something went wrong</h1>
      <p className="text-sm text-[var(--color-text-secondary)]">
        {error.name === "ApiUnavailableError"
          ? "The eflab API did not answer. It may be starting up — try again in a moment."
          : "This page could not be rendered. Try again, or go back to the home page."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs">
        <button
          type="button"
          onClick={reset}
          className="button button--sm button--secondary inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Retry
        </button>
        <Link href="/" className="button button--sm button--secondary">
          Home
        </Link>
      </div>
    </div>
  );
}
