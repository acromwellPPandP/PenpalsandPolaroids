import { redirect } from "next/navigation";
import { createClient } from "../../utils/supabase/server";

export async function requireModerator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: isModerator } = await supabase.rpc("is_moderator");

  if (!isModerator) {
    redirect("/dashboard?message=Unauthorized");
  }

  return { supabase, user };
}

export async function getOwnAccountStatus() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "active" as const, user: null };
  }

  const { data } = await supabase
    .from("account_statuses")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle<{ status: "active" | "suspended" }>();

  return { status: data?.status ?? "active", user };
}
