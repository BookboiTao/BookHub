import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh the Supabase auth session on every request.
 * Updates the auth cookies so they don't expire while the user is active.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            response.cookies.set(name, value),
          );
        },
      },
    },
  );

  // This refreshes the session (and sets updated cookies on the response)
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on all routes except static assets and auth pages
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
