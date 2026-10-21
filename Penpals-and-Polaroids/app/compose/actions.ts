"use server";

import { redirect } from "next/navigation";
import { createDeliveryPlan } from "../letters/delivery";
import { getBlockRelationship } from "../safety/blocking";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { createClient } from "../../utils/supabase/server";

function encodedMessage(message: string) {
  return encodeURIComponent(message);
}

function cleanFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function composeRedirect(message: string): never {
  redirect(`/compose?message=${encodedMessage(message)}`);
}

const MIN_LETTER_WORDS = 150;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function countWords(value: string) {
  return value.match(WORD_PATTERN)?.length ?? 0;
}

type RecipientProfile = {
  accepting_new_pen_pals?: boolean | null;
  country?: string | null;
  id: string;
  user_id?: string | null;
};

type SenderProfile = {
  country?: string | null;
  id: string;
  user_id?: string | null;
};

type AccountStatusRow = {
  status: "active" | "suspended";
  user_id: string;
};

function isMissingFunctionError(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42883" ||
    error?.message?.toLowerCase().includes("function") ||
    error?.message?.toLowerCase().includes("schema cache")
  );
}

export async function sendLetter(formData: FormData) {
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

  const recipientId = String(formData.get("recipient") ?? "");
  const body = String(formData.get("letter") ?? "").trim();
  const photo = formData.get("photo");

  if (!recipientId || !body) {
    composeRedirect("Choose a pen pal and write a letter before sending.");
  }

  if (countWords(body) < MIN_LETTER_WORDS) {
    composeRedirect(`Write at least ${MIN_LETTER_WORDS} words before sending.`);
  }

  if (!(photo instanceof File) || photo.size === 0) {
    composeRedirect("Attach exactly one image before sending.");
  }

  const image = photo as File;

  if (!image.type.startsWith("image/")) {
    composeRedirect("The attachment must be an image.");
  }

  const { data: accountStatuses } = await supabase
    .from("account_statuses")
    .select("user_id,status")
    .in("user_id", [user.id, recipientId])
    .returns<AccountStatusRow[]>();

  if ((accountStatuses ?? []).some((status) => status.status === "suspended")) {
    composeRedirect("This account is currently unavailable while it is under review.");
  }

  const { data: recipient } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", recipientId)
    .maybeSingle<RecipientProfile>();
  const { data: fallbackRecipient } = recipient
    ? { data: null }
    : await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", recipientId)
        .maybeSingle<RecipientProfile>();
  const selectedRecipient = recipient ?? fallbackRecipient;
  const validRecipientId = selectedRecipient?.user_id ?? selectedRecipient?.id;

  if (!selectedRecipient || !validRecipientId || validRecipientId === user.id) {
    composeRedirect("Choose a real pen pal before sending.");
  }

  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<SenderProfile>();
  const { data: fallbackSenderProfile } = senderProfile
    ? { data: null }
    : await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle<SenderProfile>();
  const selectedSenderProfile = senderProfile ?? fallbackSenderProfile;

  if (!selectedSenderProfile?.country || !selectedRecipient.country) {
    composeRedirect("Both Passports need a country before a letter can travel.");
  }

  const {
    currentUserBlockedOther,
    otherUserBlockedCurrent,
    safetyTablesMissing,
  } = await getBlockRelationship(
    supabase,
    user.id,
    validRecipientId,
  );

  if (safetyTablesMissing) {
    composeRedirect("Safety tables are not ready yet. Run supabase/safety_phase_1.sql before sending letters.");
  }

  if (currentUserBlockedOther) {
    composeRedirect("This Passport is in your blocked list. Unblock them in Settings > Privacy before sending a letter.");
  }

  if (otherUserBlockedCurrent) {
    composeRedirect("This Passport is not available for letters right now.");
  }

  const { data: existingLetters } = await supabase
    .from("letters")
    .select("id")
    .or(
      `and(sender_id.eq.${user.id},recipient_id.eq.${validRecipientId}),and(sender_id.eq.${validRecipientId},recipient_id.eq.${user.id})`,
    )
    .limit(1);

  if (selectedRecipient.accepting_new_pen_pals === false && !existingLetters?.length) {
    composeRedirect("This Passport is not accepting new pen pals right now.");
  }

  const photoPath = `${user.id}/${crypto.randomUUID()}-${cleanFileName(image.name)}`;
  const postedAt = new Date();
  const deliveryPlan = createDeliveryPlan({
    destinationCountry: selectedRecipient.country,
    originCountry: selectedSenderProfile.country,
    postedAt,
  });
  const { error: uploadError } = await supabase.storage
    .from("letter-photos")
    .upload(photoPath, image, {
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) {
    composeRedirect(uploadError.message);
  }

  const trackingEvents = deliveryPlan.events.map((event) => ({
    ...event,
    occurred_at: event.scheduled_at <= postedAt.toISOString() ? event.scheduled_at : null,
  }));
  const { data: postedLetterId, error: postLetterError } = await supabase.rpc(
    "post_letter_with_tracking",
    {
      destination_code: deliveryPlan.destinationCountryCode,
      estimated_delivery_timestamp: deliveryPlan.estimatedDeliveryAt.toISOString(),
      letter_body: body,
      origin_code: deliveryPlan.originCountryCode,
      photo_original_name: image.name,
      photo_storage_path: photoPath,
      posted_timestamp: postedAt.toISOString(),
      recipient_uuid: validRecipientId,
      tracking_ref: deliveryPlan.trackingReference,
      tracking_events: trackingEvents,
    },
  );

  let createdLetter = postedLetterId ? { id: String(postedLetterId) } : null;
  let insertError = postLetterError;

  if (postLetterError && isMissingFunctionError(postLetterError)) {
    const legacyPost = await supabase.rpc("post_letter", {
      destination_code: deliveryPlan.destinationCountryCode,
      estimated_delivery_timestamp: deliveryPlan.estimatedDeliveryAt.toISOString(),
      letter_body: body,
      origin_code: deliveryPlan.originCountryCode,
      photo_original_name: image.name,
      photo_storage_path: photoPath,
      posted_timestamp: postedAt.toISOString(),
      recipient_uuid: validRecipientId,
      tracking_ref: deliveryPlan.trackingReference,
    });

    createdLetter = legacyPost.data ? { id: String(legacyPost.data) } : null;
    insertError = legacyPost.error;

    if (legacyPost.error && isMissingFunctionError(legacyPost.error)) {
      const directInsert = await supabase
        .from("letters")
        .insert({
          body,
          delivered_at: null,
          delivery_mode: "realistic_mail",
          delivery_status: "posted",
          delivery_version: 1,
          destination_country_code: deliveryPlan.destinationCountryCode,
          estimated_delivery_at: deliveryPlan.estimatedDeliveryAt.toISOString(),
          origin_country_code: deliveryPlan.originCountryCode,
          photo_name: image.name,
          photo_path: photoPath,
          posted_at: postedAt.toISOString(),
          recipient_id: validRecipientId,
          sender_id: user.id,
          tracking_reference: deliveryPlan.trackingReference,
        })
        .select("id")
        .single<{ id: string }>();

      createdLetter = directInsert.data;
      insertError = directInsert.error;
    }
  }

  if (insertError || !createdLetter) {
    await supabase.storage.from("letter-photos").remove([photoPath]);
    composeRedirect(
      insertError?.message.includes("row-level security")
        ? "Letter posting is blocked by Supabase security. Run supabase/letter_posting_rpc.sql in the SQL Editor, then try again."
        : (insertError?.message ?? "The letter could not be posted."),
    );
  }

  if (postLetterError && isMissingFunctionError(postLetterError)) {
    await supabase.from("letter_tracking_events").insert(
      trackingEvents.map((event) => ({
        ...event,
        letter_id: createdLetter.id,
      })),
    );
    await supabase.from("notifications").upsert(
      {
        letter_id: createdLetter.id,
        message: "Your letter has been posted.",
        recipient_id: user.id,
        type: "letter_posted",
      },
      { onConflict: "recipient_id,letter_id,type" },
    );
  }

  redirect(`/letters/${createdLetter.id}/tracking?message=${encodedMessage("Your letter has been posted.")}`);
}
