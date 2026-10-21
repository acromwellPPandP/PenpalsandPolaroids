import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNav } from "../AccountNav";
import { sendLetter } from "./actions";
import { LetterComposer } from "./LetterComposer";
import { getBlockedUserIds } from "../safety/blocking";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { profileTableMessage } from "../../utils/supabase/errors";
import { createClient } from "../../utils/supabase/server";

type ProfileRow = {
  id?: string | null;
  user_id?: string | null;
  full_name?: string | null;
  name?: string | null;
  username?: string | null;
  country?: string | null;
  languages?: string[] | string | null;
  interests?: string[] | string | null;
  bio?: string | null;
  accepting_new_pen_pals?: boolean | null;
};

export const metadata: Metadata = {
  title: "Write | Penpals & Polaroids",
};

type LetterRow = {
  created_at: string;
  id: string;
  recipient_id: string;
  sender_id: string;
};

function profileName(profile: ProfileRow) {
  return profile.full_name || profile.name || profile.username || "A pen pal";
}

function profileId(profile: ProfileRow) {
  return profile.user_id ?? profile.id ?? "";
}

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; recipient?: string; replyTo?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { message, recipient, replyTo } = await searchParams;

  if (!user) {
    redirect("/login");
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*");

  const { data: sentOrReceivedLetters } = await supabase
    .from("letters")
    .select("id,sender_id,recipient_id,created_at")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .returns<LetterRow[]>();

  const existingPenPalIds = new Set(
    (sentOrReceivedLetters ?? []).map((letter) =>
      letter.sender_id === user.id ? letter.recipient_id : letter.sender_id,
    ),
  );

  const { blockedUserIds, safetyTablesMissing } = await getBlockedUserIds(
    supabase,
    user.id,
  );

  const profileRows = (profiles ?? []).filter((profile: ProfileRow) => {
    const id = profileId(profile);

    return id && id !== user.id && !blockedUserIds.has(id);
  });
  const recipients = profileRows
    .filter(
      (profile: ProfileRow) => {
        const id = profileId(profile);

        return (
          Boolean(profile.country) &&
          Boolean(profile.languages) &&
          Boolean(profile.interests) &&
          Boolean(profile.bio) &&
          (profile.accepting_new_pen_pals !== false || existingPenPalIds.has(id))
        );
      },
    )
    .map((profile: ProfileRow) => {
      const name = profileName(profile);
      const country = profile.country ? ` in ${profile.country}` : "";

      return {
        id: profileId(profile) || name,
        label: `${name}${country}`,
      };
    });
  let selectedRecipientId =
    recipient && blockedUserIds.has(recipient) ? undefined : recipient;
  let replyStatus: string | undefined;

  if (replyTo) {
    const { data: letter } = await supabase
      .from("letters")
      .select("id,sender_id,recipient_id,created_at")
      .eq("id", replyTo)
      .maybeSingle<LetterRow>();

    if (letter && (letter.sender_id === user.id || letter.recipient_id === user.id)) {
      const otherUserId =
        letter.sender_id === user.id ? letter.recipient_id : letter.sender_id;
      selectedRecipientId = blockedUserIds.has(otherUserId) ? undefined : otherUserId;
      const recipientProfile = profileRows.find(
        (profile: ProfileRow) =>
          profile.id === otherUserId || profile.user_id === otherUserId,
      );
      const recipientName = recipientProfile
        ? profileName(recipientProfile)
        : "this pen pal";

      replyStatus = `Replying to ${recipientName}. Add one new photo before sending.`;
    }
  }

  const safetyMessage = safetyTablesMissing
    ? "Safety tables are not ready yet. Run supabase/safety_phase_1.sql before sending letters."
    : undefined;

  if (selectedRecipientId && !replyStatus) {
    const selectedProfile = profileRows.find(
      (profile: ProfileRow) =>
        profile.id === selectedRecipientId || profile.user_id === selectedRecipientId,
    );

    if (selectedProfile) {
      const country = selectedProfile.country ? ` in ${selectedProfile.country}` : "";

      replyStatus = `Writing to ${profileName(selectedProfile)}${country}. Add one Polaroid before sending.`;
    }
  }

  if (
    selectedRecipientId &&
    !recipients.some((existingRecipient) => existingRecipient.id === selectedRecipientId)
  ) {
    const selectedProfile = profileRows.find(
      (profile: ProfileRow) =>
        profile.id === selectedRecipientId || profile.user_id === selectedRecipientId,
    );

    if (
      selectedProfile &&
      (selectedProfile.accepting_new_pen_pals !== false ||
        existingPenPalIds.has(profileId(selectedProfile)))
    ) {
      const name = profileName(selectedProfile);
      const country = selectedProfile.country ? ` in ${selectedProfile.country}` : "";
      const id = profileId(selectedProfile);

      recipients.push({
        id: id || selectedRecipientId,
        label: `${name}${country}`,
      });
    }
  }

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="composerShell" aria-labelledby="composer-title">
        <div className="composerIntro">
          <p className="eyebrow">Write</p>
          <h1 id="composer-title">Write a letter worth waiting for.</h1>
          <p className="intro">
            Settle in with stationery, write at least 150 words, and tuck
            one Polaroid beneath the page before sending.
          </p>
        </div>

        <LetterComposer
          profilesError={profilesError ? profileTableMessage(profilesError) : undefined}
          recipients={recipients}
          sendLetterAction={sendLetter}
          selectedRecipientId={selectedRecipientId}
          statusMessage={message ?? safetyMessage}
          replyStatus={replyStatus}
        />
      </section>
    </main>
  );
}
