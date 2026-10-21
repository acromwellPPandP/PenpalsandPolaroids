"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { profileTableMessage } from "../../utils/supabase/errors";
import { createClient } from "../../utils/supabase/server";

function encodedMessage(message: string) {
  return encodeURIComponent(message);
}

export async function updateProfile(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(
      `/login?message=${encodedMessage("Add your Supabase URL and anon key before saving a profile.")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: accountStatus } = await supabase
    .from("account_statuses")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle<{ status: "active" | "suspended" }>();

  if (accountStatus?.status === "suspended") {
    redirect(
      `/profile?message=${encodedMessage("Your account is currently unavailable while it is under review.")}`,
    );
  }

  const country = String(formData.get("country") ?? "").trim();
  const languages = String(formData.get("languages") ?? "").trim();
  const interests = String(formData.get("interests") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();

  if (!country || !languages || !interests || !bio) {
    redirect(
      `/profile?message=${encodedMessage("Complete country, languages, interests, and bio before saving.")}`,
    );
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      bio,
      country,
      id: user.id,
      interests,
      languages,
    },
    {
      onConflict: "id",
    },
  );

  if (error) {
    redirect(`/profile?message=${encodedMessage(profileTableMessage(error))}`);
  }

  redirect(`/profile?message=${encodedMessage("Passport saved.")}`);
}
