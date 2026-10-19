import type { Metadata } from "next";
import type { ReactNode } from "react";

// Private admin area (openspec change admin-sync-worker, design decision 10).
// Never indexed (this metadata, each page's own `robots`, and the
// `X-Robots-Tag: noindex` header from next.config.ts), never cached (rendered
// per request — `force-dynamic` makes Next send `no-store` instead of the
// prerender cache header — plus the next.config.ts header), never linked from
// the public navigation, footer or a sitemap. The pages are client-rendered
// behind `admin.me` (components/admin/AdminShell.tsx), so their HTML carries no
// admin data. This layout stays a server component without client imports:
// the admin tRPC provider is mounted by each page (see lib/admin-trpc.tsx for
// why — the public pages' bundle).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · eFootLab" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
