import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase server client — one per request, scoped to the session cookies.
 * RLS policies on every table enforce that a user only sees their own rows.
 * No service-role key is ever used in the app layer.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    },
  );
}

/**
 * Get the authenticated user, or null.
 * Uses getUser() which validates the JWT server-side (not getSession()).
 */
export async function getAuthUser() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Require a session. Returns the user, or a 401 Response.
 * Use in route handlers: const userOr401 = await requireUser(); if (userOr401 instanceof Response) return userOr401;
 */
export async function requireUser() {
  const user = await getAuthUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

/**
 * Upsert the public.users mirror row for an authenticated user.
 * Called on first authenticated request for a user.
 */
export async function ensureUserRow(userId: string, email: string) {
  const supabase = await createSupabaseServer();
  await supabase
    .from("users")
    .upsert({ id: userId, email }, { onConflict: "id" })
    .select()
    .single();
}
