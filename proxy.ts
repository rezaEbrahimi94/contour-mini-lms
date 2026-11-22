import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { appConfig } from "./lib/env.ts";

export async function proxy(request: NextRequest) {
  const { supabaseUrl, publishableKey, cookieOptions } = appConfig();
  const updates: Parameters<SetAllCookies>[0] = [];
  const responseHeaders = new Headers({ "Cache-Control": "private, no-store" });
  const auth = createServerClient(supabaseUrl, publishableKey, {
    cookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (changes, cacheHeaders) => {
        updates.push(...changes);
        for (const [name, value] of Object.entries(cacheHeaders))
          responseHeaders.set(name, value);
      },
    },
  });

  // Read the bearer for transport only. The page verifies it with Auth before use.
  // Only the proxy rotates page-session cookies; rendering cannot persist a rotation.
  const { data } = await auth.auth.getSession();
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  if (data.session)
    headers.set("authorization", `Bearer ${data.session.access_token}`);

  const response = NextResponse.next({
    request: { headers },
    headers: responseHeaders,
  });
  for (const { name, value, options } of updates)
    response.cookies.set(name, value, options);
  return response;
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*"] };
