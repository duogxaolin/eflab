// Admin sign-in paths (openspec change admin-sync-worker). Plain module (no
// "use client") so the server page of /admin/login can call it too.
import type { Route } from "next";

export const ADMIN_LOGIN_PATH = "/admin/login";

/**
 * The page to return to after sign-in: an /admin path (never /admin/login,
 * never another origin — `//host` and `/\host` are refused), else /admin.
 */
export function safeAdminNext(next: string | null | undefined): Route {
  if (!next) return "/admin";
  if (!/^\/admin(\/[A-Za-z0-9_\-/]*)?$/.test(next) || next.includes("//")) return "/admin";
  if (next === ADMIN_LOGIN_PATH || next.startsWith(`${ADMIN_LOGIN_PATH}/`)) return "/admin";
  // The one route cast of the web app (change small-fixes-1027, design D4):
  // `next` comes from the address bar, so its type is `string`; the checks
  // above keep it a same-origin path under /admin, which the route types
  // cannot express. It may still name no page (`/admin/nope` → the 404 page),
  // as before. Every other link and router call is checked without a cast.
  return next as Route;
}

/** /admin/login, with `?next=` when the visitor came from another admin page. */
export function loginHref(from: string | null | undefined): Route {
  const next = safeAdminNext(from);
  return next === "/admin" ? ADMIN_LOGIN_PATH : `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}
