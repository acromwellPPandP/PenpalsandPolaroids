"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { createClient } from "../../utils/supabase/server";

function safeReturnTo(value: FormDataEntryValue | null) {
  const returnTo = String(value ?? "/inbox");

  return returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : "/inbox";
}

function withMessage(path: string, message: string) {
  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}message=${encodeURIComponent(message)}`;
}

function stripQuery(path: string) {
  return path.split("?")[0] ?? path;
}

function returnAfterRemoval(returnTo: string, letterId: string) {
  const cleanPath = stripQuery(returnTo);

  if (cleanPath === `/inbox/${letterId}`) {
    return "/inbox";
  }

  if (cleanPath === `/letters/${letterId}/tracking`) {
    return "/sent";
  }

  return returnTo;
}

function returnAfterWithdrawal(returnTo: string, letterId: string) {
  const cleanPath = stripQuery(returnTo);

  if (cleanPath === `/inbox/${letterId}`) {
    return `/letters/${letterId}/tracking`;
  }

  return returnTo;
}

function friendlyError(message?: string) {
  if (!message) {
    return "This action is not available for this letter.";
  }

  if (message.toLowerCase().includes("already arrived")) {
    return "This letter has already arrived and can no longer be withdrawn.";
  }

  if (
    message.toLowerCase().includes("function") ||
    message.toLowerCase().includes("schema cache")
  ) {
    return "Letter removal is not ready yet. Run supabase/letter_removal.sql in Supabase SQL Editor.";
  }

  return "This action is not available for this letter.";
}

async function authenticatedClient() {
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

function revalidateLetterViews(letterId: string) {
  revalidatePath("/inbox");
  revalidatePath("/sent");
  revalidatePath("/settings/privacy/removed");
  revalidatePath(`/inbox/${letterId}`);
  revalidatePath(`/letters/${letterId}/tracking`);
}

export async function removeLetterFromMyView(formData: FormData) {
  const { supabase } = await authenticatedClient();
  const letterId = String(formData.get("letterId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!letterId) {
    redirect(withMessage(returnTo, "This action is not available for this letter."));
  }

  const { error } = await supabase.rpc("remove_letter_from_my_view", {
    letter_uuid: letterId,
  });

  if (error) {
    redirect(withMessage(returnTo, friendlyError(error.message)));
  }

  revalidateLetterViews(letterId);
  redirect(withMessage(returnAfterRemoval(returnTo, letterId), "The letter has been removed from your view."));
}

export async function restoreLetterToMyView(formData: FormData) {
  const { supabase } = await authenticatedClient();
  const letterId = String(formData.get("letterId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!letterId) {
    redirect(withMessage(returnTo, "This action is not available for this letter."));
  }

  const { error } = await supabase.rpc("restore_letter_to_my_view", {
    letter_uuid: letterId,
  });

  if (error) {
    redirect(withMessage(returnTo, friendlyError(error.message)));
  }

  revalidateLetterViews(letterId);
  redirect(withMessage(returnTo, "The letter has been restored to your Scrapbook."));
}

export async function permanentlyRemoveLetterFromMyAccount(formData: FormData) {
  const { supabase } = await authenticatedClient();
  const letterId = String(formData.get("letterId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!letterId) {
    redirect(withMessage(returnTo, "This action is not available for this letter."));
  }

  const { error } = await supabase.rpc("permanently_remove_letter_from_my_view", {
    letter_uuid: letterId,
  });

  if (error) {
    redirect(withMessage(returnTo, friendlyError(error.message)));
  }

  revalidateLetterViews(letterId);
  redirect(withMessage(returnTo, "The letter has been permanently removed from your account view."));
}

export async function withdrawLetter(formData: FormData) {
  const { supabase } = await authenticatedClient();
  const letterId = String(formData.get("letterId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const returnTo = safeReturnTo(formData.get("returnTo"));

  if (!letterId) {
    redirect(withMessage(returnTo, "This action is not available for this letter."));
  }

  const { error } = await supabase.rpc("withdraw_letter", {
    letter_uuid: letterId,
    reason,
  });

  if (error) {
    redirect(withMessage(returnTo, friendlyError(error.message)));
  }

  revalidateLetterViews(letterId);
  redirect(withMessage(returnAfterWithdrawal(returnTo, letterId), "Your letter has been withdrawn."));
}
