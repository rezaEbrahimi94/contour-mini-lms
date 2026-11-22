// What a trusted operator does to the local stack on behalf of a test: find or
// delete a fixture account and grant or revoke admin membership. It uses the
// stack's own secret key through the Supabase client, so it needs no psql, no
// container name and no SQL string built from an email address.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types.ts";
import { localStack } from "./stack.ts";

export function operatorClient() {
  const { apiUrl, secretKey } = localStack();
  return createClient<Database>(apiUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const usersPerPage = 200;

export async function findUserId(email: string): Promise<string | null> {
  const { auth } = operatorClient();
  for (let page = 1; ; page++) {
    const { data, error } = await auth.admin.listUsers({
      page,
      perPage: usersPerPage,
    });
    if (error)
      throw new Error("Unable to list local accounts", { cause: error });
    const match = data.users.find((user) => user.email === email);
    if (match) return match.id;
    if (data.users.length < usersPerPage) return null;
  }
}

async function requireUserId(email: string) {
  const id = await findUserId(email);
  if (!id) throw new Error(`No local account for ${email}`);
  return id;
}

export async function setAdmin(email: string, enabled: boolean) {
  const memberships = operatorClient().from("admin_memberships");
  const user_id = await requireUserId(email);
  const { error } = enabled
    ? await memberships.upsert({ user_id })
    : await memberships.delete().eq("user_id", user_id);
  if (error)
    throw new Error("Unable to change admin membership", { cause: error });
}

/** Removes the account and, through foreign keys, everything it owns. */
export async function deleteAccount(email: string) {
  const id = await findUserId(email);
  if (!id) return;
  const { error } = await operatorClient().auth.admin.deleteUser(id);
  if (error)
    throw new Error("Unable to delete a local account", { cause: error });
}
