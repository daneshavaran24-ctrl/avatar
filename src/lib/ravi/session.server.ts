import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function startSession(clientLabel: string | null): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("conversation_sessions")
    .insert({ client_label: clientLabel, status: "ACTIVE" })
    .select("id")
    .single();
  if (error || !data) throw new Error("ایجاد نشست گفتگو ناموفق بود.");
  return data.id;
}

export async function endSession(sessionId: string): Promise<void> {
  await supabaseAdmin
    .from("conversation_sessions")
    .update({ status: "ENDED", ended_at: new Date().toISOString() })
    .eq("id", sessionId);
}