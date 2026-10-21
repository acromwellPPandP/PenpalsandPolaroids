import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccountNav } from "../../AccountNav";
import { reconcileDeliveries } from "../../letters/delivery";
import { SafetyActions } from "../../safety/SafetyActions";
import { areUsersBlocked } from "../../safety/blocking";
import { isSupabaseConfigured } from "../../../utils/supabase/config";
import { createClient } from "../../../utils/supabase/server";

type LetterRow = {
  body: string;
  created_at: string;
  delivered_at?: string | null;
  delivery_status?: string | null;
  estimated_delivery_at?: string | null;
  id: string;
  photo_name: string;
  photo_path: string;
  read_at: string | null;
  recipient_id: string;
  sender_id: string;
};

type ScrapbookEntry = LetterRow & {
  direction: "Received" | "Sent";
  photoUrl?: string;
};

export const metadata: Metadata = {
  title: "Scrapbook Entry | Penpals & Polaroids",
};

type ProfileRow = {
  country?: string | null;
  full_name?: string | null;
  id: string;
  name?: string | null;
  username?: string | null;
};

function displayName(profile?: ProfileRow | null) {
  return profile?.full_name || profile?.name || profile?.username || "A pen pal";
}

export default async function LetterPage({
  params,
  searchParams,
}: {
  params: Promise<{ letterId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const { letterId } = await params;
  const { message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await reconcileDeliveries(supabase);

  const { data: letter } = await supabase
    .from("letters")
    .select("id,sender_id,recipient_id,body,photo_name,photo_path,created_at,read_at,delivered_at,delivery_status,estimated_delivery_at")
    .eq("id", letterId)
    .maybeSingle<LetterRow>();

  if (!letter || (letter.recipient_id !== user.id && letter.sender_id !== user.id)) {
    notFound();
  }

  if (
    letter.recipient_id === user.id &&
    letter.delivery_status !== "delivered"
  ) {
    redirect(`/letters/${letter.id}/tracking`);
  }

  const otherUserId =
    letter.sender_id === user.id ? letter.recipient_id : letter.sender_id;
  const { blocked } = await areUsersBlocked(supabase, user.id, otherUserId);

  if (blocked) {
    notFound();
  }

  if (letter.recipient_id === user.id && !letter.read_at) {
    await supabase
      .from("letters")
      .update({ read_at: new Date().toISOString() })
      .eq("id", letter.id)
      .eq("recipient_id", user.id);
  }

  const replyRecipientId = otherUserId;
  const participantIds = [letter.sender_id, letter.recipient_id];

  const { data: threadLetters } = await supabase
    .from("letters")
    .select("id,sender_id,recipient_id,body,photo_name,photo_path,created_at,read_at")
    .or(
      `and(sender_id.eq.${participantIds[0]},recipient_id.eq.${participantIds[1]}),and(sender_id.eq.${participantIds[1]},recipient_id.eq.${participantIds[0]})`,
    )
    .order("created_at", { ascending: true })
    .returns<LetterRow[]>();

  const { data: participantProfiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", participantIds)
    .returns<ProfileRow[]>();

  const profileById = new Map(
    (participantProfiles ?? []).map((profile) => [profile.id, profile]),
  );
  const senderProfile = profileById.get(letter.sender_id);
  const replyProfile = profileById.get(replyRecipientId);
  const entries: ScrapbookEntry[] = await Promise.all(
    (threadLetters?.length ? threadLetters : [letter]).map(async (entry) => {
      const { data: photo } = await supabase.storage
        .from("letter-photos")
        .createSignedUrl(entry.photo_path, 60 * 10);

      return {
        ...entry,
        direction: entry.sender_id === user.id ? "Sent" : "Received",
        photoUrl: photo?.signedUrl,
      };
    }),
  );

  return (
    <main className="dashboardPage">
      <AccountNav />

      <article className="letterReader" aria-labelledby="letter-title">
        <div className="letterReaderHeader">
          <p className="eyebrow">Scrapbook entry</p>
          <h1 id="letter-title">A letter and its polaroid.</h1>
          <p className="intro">
            Your shared Scrapbook with {displayName(replyProfile)}
            {replyProfile?.country ? ` in ${replyProfile.country}` : ""}.
            Each entry keeps its letter paired with the exact Polaroid sent with it.
          </p>
          {message ? <p className="formMessage">{message}</p> : null}
          <div className="letterActions">
            <Link
              className="button"
              href={`/compose?replyTo=${letter.id}&recipient=${replyRecipientId}`}
            >
              Reply
            </Link>
            <Link className="secondaryButton" href="/inbox">
              Back to scrapbooks
            </Link>
          </div>
          <SafetyActions
            letterId={letter.id}
            reportedUserId={replyRecipientId}
            scrapbookId={letter.id}
            userName={displayName(replyProfile)}
          />
        </div>

        <section className="scrapbookEntryList" aria-label="Scrapbook letters">
          {entries.map((entry) => {
            const entrySenderProfile = profileById.get(entry.sender_id);

            return (
              <article
                className="letterReaderGrid scrapbookEntry"
                data-current={entry.id === letter.id}
                key={entry.id}
              >
                <div className="letterPaper">
                  <div className="letterEntryMeta">
                    <p>
                      {entry.direction} from {displayName(entrySenderProfile)}
                      {entrySenderProfile?.country
                        ? ` in ${entrySenderProfile.country}`
                        : ""}
                    </p>
                    <time dateTime={entry.created_at}>
                      {new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(
                        new Date(entry.created_at),
                      )}
                    </time>
                  </div>
                  {entry.body.split("\n").map((paragraph, index) => (
                    <p key={`${entry.id}-${index}`}>{paragraph || "\u00a0"}</p>
                  ))}
                </div>

                <figure className="receivedPolaroid">
                  {entry.photoUrl ? (
                    <img src={entry.photoUrl} alt={entry.photo_name} />
                  ) : (
                    <div className="emptyPreview">Photo unavailable</div>
                  )}
                  <figcaption>{entry.photo_name}</figcaption>
                </figure>
              </article>
            );
          })}
        </section>
      </article>
    </main>
  );
}
