import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  const { url, key } = supabaseConfig();
  browserClient ??= createBrowserClient(url, key);
  return browserClient;
}
