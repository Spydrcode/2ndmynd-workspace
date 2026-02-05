import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createSupabaseServerClient() {
  const authDisabled = process.env.AUTH_DISABLED !== "0";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

  if (authDisabled && (!url || !key)) {
    return {
      auth: {
        async getUser() {
          return { data: { user: null }, error: null };
        },
        async exchangeCodeForSession() {
          return { data: null, error: null };
        },
      },
    } as unknown as ReturnType<typeof createServerClient>;
  }

  if (!url || !key) {
    throw new Error("Missing Supabase URL or anon key.");
  }

  if (authDisabled) {
    // Auth-disabled mode: ignore cookies so auth.getUser() is always null.
    return createServerClient(url, key, {
      cookies: {
        get() {
          return undefined;
        },
        set() {
          // no-op
        },
        remove() {
          // no-op
        },
      },
    });
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return (cookieStore as unknown as { get?: (name: string) => { value?: string } | undefined }).get?.(name)
          ?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        const store = cookieStore as unknown as { set?: (args: { name: string; value: string } & Record<string, unknown>) => void };
        if (typeof store.set === "function") {
          store.set({ name, value, ...(options as Record<string, unknown>) });
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        const store = cookieStore as unknown as { set?: (args: { name: string; value: string } & Record<string, unknown>) => void };
        if (typeof store.set === "function") {
          store.set({ name, value: "", ...(options as Record<string, unknown>) });
        }
      },
    },
  });
}
