import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig, supabaseConfig } from "./config";

export async function updateSession(request: NextRequest) {
  if (!hasSupabaseConfig()) return NextResponse.next({ request });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-tarizz-user-email");
  let refreshedCookies: Array<{ name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] }> = [];
  const { url, key } = supabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        refreshedCookies = cookiesToSet;
      }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isAuth = path === "/login" || path === "/signup" || path.startsWith("/reset-password") || path.startsWith("/update-password");
  const isPrivate = path.startsWith("/dashboard") || path.startsWith("/projects") || path.startsWith("/calendar") || path.startsWith("/settings");
  const withRefreshedCookies = (response: NextResponse) => {
    refreshedCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    return response;
  };
  if (!user && isPrivate) return withRefreshedCookies(NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(path)}`, request.url)));
  if (user && isAuth) return withRefreshedCookies(NextResponse.redirect(new URL("/dashboard", request.url)));
  if (user) requestHeaders.set("x-tarizz-user-email", encodeURIComponent(user.email || "Your vault"));
  return withRefreshedCookies(NextResponse.next({ request: { headers: requestHeaders } }));
}
