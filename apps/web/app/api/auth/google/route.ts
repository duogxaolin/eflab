// Google OAuth entry point — redirects the browser to the Fastify API's
// `/auth/google/login` route, which sets the state cookie and bounces to
// Google's consent screen. Keeping the OAuth start on the API origin (rather
// than here) means the state cookie and the callback share an origin.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  return NextResponse.redirect(`${apiOrigin}/auth/google/login`, { status: 302 });
}
