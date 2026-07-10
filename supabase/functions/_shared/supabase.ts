import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError } from "./cors.ts";

export type AuthContext = {
  userId: string;
  userClient: SupabaseClient;
  getServiceClient: () => SupabaseClient;
};

export function getEnv(name: string, required = true): string {
  const value = Deno.env.get(name);
  if (!value && required) {
    throw new HttpError(500, `Missing environment variable: ${name}`);
  }

  return value ?? "";
}

export function createServiceClient(): SupabaseClient {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey);
}

export function createUserClient(req: Request): SupabaseClient {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
}

export async function requireAuth(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing bearer token.");
  }

  const userClient = createUserClient(req);
  const { data, error } = await userClient.auth.getUser();

  if (error || !data.user) {
    throw new HttpError(401, "Invalid or expired bearer token.");
  }

  return {
    userId: data.user.id,
    userClient,
    getServiceClient: createServiceClient,
  };
}
