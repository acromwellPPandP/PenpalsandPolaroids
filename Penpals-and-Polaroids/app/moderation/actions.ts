"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModerator } from "./auth";

function encoded(value: string) {
  return encodeURIComponent(value);
}

async function writeAudit({
  action,
  reason,
  reportId,
  targetUserId,
}: {
  action: string;
  reason?: string | null;
  reportId?: string | null;
  targetUserId: string;
}) {
  const { supabase, user } = await requireModerator();

  await supabase.from("moderation_audit_log").insert({
    action,
    moderator_id: user.id,
    reason: reason || null,
    report_id: reportId || null,
    target_user_id: targetUserId,
  });

  return { supabase, user };
}

export async function markReviewing(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const { supabase, user } = await writeAudit({
    action: "mark_reviewing",
    reason: notes,
    reportId,
    targetUserId,
  });

  await supabase
    .from("reports")
    .update({
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      status: "under_review",
    })
    .eq("id", reportId);

  revalidatePath("/moderation");
  redirect(`/moderation/${reportId}?message=${encoded("Report marked under review.")}`);
}

export async function resolveReport(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const { supabase, user } = await writeAudit({
    action: "resolve_report",
    reason: notes,
    reportId,
    targetUserId,
  });

  await supabase
    .from("reports")
    .update({
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      status: "resolved",
    })
    .eq("id", reportId);

  revalidatePath("/moderation");
  redirect(`/moderation/${reportId}?message=${encoded("Report resolved.")}`);
}

export async function dismissReport(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const { supabase, user } = await writeAudit({
    action: "dismiss_report",
    reason: notes,
    reportId,
    targetUserId,
  });

  await supabase
    .from("reports")
    .update({
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      status: "dismissed",
    })
    .eq("id", reportId);

  revalidatePath("/moderation");
  redirect(`/moderation/${reportId}?message=${encoded("Report dismissed.")}`);
}

export async function issueWarning(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "Community safety warning";
  const notes = String(formData.get("notes") ?? "").trim();
  const { supabase, user } = await writeAudit({
    action: "issue_warning",
    reason,
    reportId,
    targetUserId,
  });

  await supabase.from("account_warnings").insert({
    moderator_id: user.id,
    notes,
    reason,
    report_id: reportId || null,
    user_id: targetUserId,
  });

  revalidatePath("/moderation");
  redirect(`/moderation/${reportId}?message=${encoded("Warning issued.")}`);
}

export async function suspendUser(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "Account under review";
  const { supabase, user } = await writeAudit({
    action: "suspend_user",
    reason,
    reportId,
    targetUserId,
  });

  await supabase.from("account_statuses").upsert(
    {
      reason,
      restored_at: null,
      restored_by: null,
      status: "suspended",
      suspended_at: new Date().toISOString(),
      suspended_by: user.id,
      user_id: targetUserId,
    },
    { onConflict: "user_id" },
  );

  if (reportId) {
    await supabase
      .from("reports")
      .update({ reviewed_by: user.id, reviewed_at: new Date().toISOString(), status: "resolved" })
      .eq("id", reportId);
  }

  revalidatePath("/moderation");
  revalidatePath("/browse");
  revalidatePath("/compose");
  revalidatePath("/inbox");
  revalidatePath(`/profile/${targetUserId}`);
  redirect(`/moderation/${reportId}?message=${encoded("Account suspended.")}`);
}

export async function restoreUser(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "Account restored";
  const { supabase, user } = await writeAudit({
    action: "restore_user",
    reason,
    reportId,
    targetUserId,
  });

  await supabase.from("account_statuses").upsert(
    {
      reason,
      restored_at: new Date().toISOString(),
      restored_by: user.id,
      status: "active",
      user_id: targetUserId,
    },
    { onConflict: "user_id" },
  );

  revalidatePath("/moderation");
  revalidatePath("/browse");
  revalidatePath("/compose");
  revalidatePath("/inbox");
  revalidatePath(`/profile/${targetUserId}`);
  redirect(`/moderation/${reportId}?message=${encoded("Account restored.")}`);
}
