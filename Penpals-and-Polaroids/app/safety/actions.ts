"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { createClient } from "../../utils/supabase/server";

const reportCategories = new Set([
  "harassment",
  "inappropriate_content",
  "spam",
  "impersonation",
  "privacy_concern",
  "underage_safety",
  "other",
]);

function safeReturnTo(value: FormDataEntryValue | null) {
  const returnTo = String(value ?? "/dashboard");

  return returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/dashboard";
}

function withMessage(path: string, message: string) {
  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}message=${encodeURIComponent(message)}`;
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    error?.message?.toLowerCase().includes("could not find the table")
  );
}

async function authenticatedUser() {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

async function saveBlock(supabase: Awaited<ReturnType<typeof createClient>>, blockerId: string, blockedUserId: string) {
  const { error: phaseOneError } = await supabase.from("blocked_users").upsert(
    {
      blocked_user_id: blockedUserId,
      blocker_id: blockerId,
    },
    { onConflict: "blocker_id,blocked_user_id" },
  );

  const { error: legacyError } = await supabase.from("blocks").upsert(
    {
      blocked_id: blockedUserId,
      blocker_id: blockerId,
    },
    { onConflict: "blocker_id,blocked_id" },
  );

  if (phaseOneError && legacyError) {
    return isMissingTableError(phaseOneError) && !isMissingTableError(legacyError)
      ? legacyError
      : phaseOneError;
  }

  return null;
}

export async function blockUser(formData: FormData) {
  const { supabase, user } = await authenticatedUser();
  const blockedUserId = String(formData.get("blockedUserId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!blockedUserId || blockedUserId === user.id) {
    redirect(withMessage(returnTo, "Choose a real Passport before blocking."));
  }

  const error = await saveBlock(supabase, user.id, blockedUserId);

  if (error) {
    redirect(withMessage(returnTo, error.message));
  }

  revalidatePath("/browse");
  revalidatePath("/inbox");
  revalidatePath("/settings/privacy");
  redirect(withMessage("/browse", "Passport blocked."));
}

export async function unblockUser(formData: FormData) {
  const { supabase, user } = await authenticatedUser();
  const blockedUserId = String(formData.get("blockedUserId") ?? "");

  if (blockedUserId) {
    await supabase
      .from("blocked_users")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_user_id", blockedUserId);
    await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", blockedUserId);
  }

  revalidatePath("/browse");
  revalidatePath("/inbox");
  revalidatePath("/settings/privacy");
  redirect(withMessage("/settings/privacy", "Passport unblocked."));
}

export async function reportContent(formData: FormData) {
  const { supabase, user } = await authenticatedUser();
  const reportedUserId = String(formData.get("reportedUserId") ?? "");
  const letterId = String(formData.get("letterId") ?? "") || null;
  const scrapbookId = String(formData.get("scrapbookId") ?? "") || null;
  const category = String(formData.get("category") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const alsoBlock = formData.get("alsoBlock") === "on";
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!reportedUserId || reportedUserId === user.id || !reportCategories.has(category)) {
    redirect(withMessage(returnTo, "Choose a report category before submitting."));
  }

  const { error } = await supabase.from("reports").insert({
    category,
    description,
    letter_id: letterId,
    reporter_id: user.id,
    reported_user_id: reportedUserId,
    scrapbook_id: scrapbookId,
    status: "pending",
  });

  if (error && error.code !== "23505") {
    redirect(withMessage(returnTo, error.message));
  }

  if (alsoBlock) {
    await saveBlock(supabase, user.id, reportedUserId);
  }

  revalidatePath("/browse");
  revalidatePath("/inbox");
  revalidatePath("/settings/privacy");
  redirect(
    withMessage(
      alsoBlock ? "/inbox" : returnTo,
      "Thank you. Your report has been submitted for review.",
    ),
  );
}
