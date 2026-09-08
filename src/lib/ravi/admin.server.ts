import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Role check runs through the caller's RLS-scoped client and the security
 * definer has_role() function — never through the admin client.
 */
export async function assertAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || !data) {
    throw new Error("دسترسی مدیریتی برای این حساب کاربری فعال نیست.");
  }
}