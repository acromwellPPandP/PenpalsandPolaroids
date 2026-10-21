import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AccountNav } from "../AccountNav";
import { LetterRemovalControls } from "../letters/LetterRemovalControls";
import { reconcileDeliveries } from "../letters/delivery";
import {
  CompactTrackingProgress,
  TrackLetterLink,
  deliveryStatusLabel,
  formatDeliveryDate,
  formatPostedDate,
  formatTrackingReference,
} from "../letters/trackingDisplay";
import { getBlockedUserIds } from "../safety/blocking";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { createClient } from "../../utils/supabase/server";

type LetterEnvelope = {
  created_at: string;
  delivered_at: string | null;
  delivery_status: string;
  destination_country_code: string;
  estimated_delivery_at: string;
  id: string;
  origin_country_code: string;
  posted_at: string;
  recipient_id: string;
  sender_id: string;
  tracking_reference: string;
  withdrawn_at?: string | null;
  withdrawn_by?: string | null;
};

type SentLetterRow = {
  body: string;
  created_at: string;
  delivered_at?: string | null;
  destination_country_code?: string | null;
  delivery_mode?: string | null;
  delivery_status?: string | null;
  delivery_version?: number | null;
  estimated_delivery_at?: string | null;
  id: string;
  origin_country_code?: string | null;
  photo_name: string;
  photo_path: string;
  posted_at?: string | null;
  read_at?: string | null;
  recipient_id: string;
  sender_id: string;
  tracking_reference?: string | null;
  withdrawn_at?: string | null;
  withdrawn_by?: string | null;
};

type ProfileRow = {
  country?: string | null;
  full_name?: string | null;
  id: string;
  name?: string | null;
  user_id?: string | null;
  username?: string | null;
};

export const metadata: Metadata = {
  title: "Sent | Penpals & Polaroids",
};

function displayName(profile?: ProfileRow) {
  return profile?.full_name || profile?.name || profile?.username || "A pen pal";
}

function previewText(body?: string) {
  if (!body) {
    return "Open your outgoing letter to reread what you posted.";
  }

  return body.length > 140 ? `${body.slice(0, 140)}...` : body;
}

function envelopeFromSentLetter(letter: SentLetterRow): LetterEnvelope {
  const deliveredAt =
    letter.delivered_at ??
    (!letter.delivery_mode && !letter.delivery_version ? letter.created_at : null);

  return {
    created_at: letter.created_at,
    delivered_at: deliveredAt,
    delivery_status:
      letter.delivery_status ?? (deliveredAt ? "delivered" : "posted"),
    destination_country_code: letter.destination_country_code ?? "To",
    estimated_delivery_at:
      letter.estimated_delivery_at ?? deliveredAt ?? letter.created_at,
    id: letter.id,
    origin_country_code: letter.origin_country_code ?? "From",
    posted_at: letter.posted_at ?? letter.created_at,
    recipient_id: letter.recipient_id,
    sender_id: letter.sender_id,
    tracking_reference:
      letter.tracking_reference ??
      `PP-${letter.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    withdrawn_at: letter.withdrawn_at,
    withdrawn_by: letter.withdrawn_by,
  };
}

export default async function SentPage() {
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

  await reconcileDeliveries(supabase);

  const { blockedUserIds } = await getBlockedUserIds(supabase, user.id);
  const { data: envelopes, error: envelopesError } = await supabase
    .rpc("get_letter_envelopes")
    .returns<LetterEnvelope[]>();
  const { data: deliverySentLetters, error: deliverySentLettersError } = await supabase
    .from("letters")
    .select("id,sender_id,recipient_id,body,photo_name,photo_path,created_at,read_at,delivered_at,delivery_status,posted_at,estimated_delivery_at,tracking_reference,origin_country_code,destination_country_code,delivery_mode,delivery_version,withdrawn_at,withdrawn_by")
    .eq("sender_id", user.id)
    .order("created_at", { ascending: false })
    .returns<SentLetterRow[]>();
  const { data: legacySentLetters } = deliverySentLettersError
    ? await supabase
        .from("letters")
        .select("id,sender_id,recipient_id,body,photo_name,photo_path,created_at,read_at")
        .eq("sender_id", user.id)
        .order("created_at", { ascending: false })
        .returns<SentLetterRow[]>()
    : { data: null };
  const sentLetters = ((deliverySentLetters ?? legacySentLetters ?? []) as SentLetterRow[])
    .filter((letter) => !blockedUserIds.has(letter.recipient_id));
  const { data: hiddenRows } = await supabase
    .from("letter_user_visibility")
    .select("letter_id,hidden_at,restored_at,permanently_removed_from_view_at")
    .eq("user_id", user.id);
  const hiddenLetterIds = new Set(
    ((hiddenRows ?? []) as Array<{
      hidden_at?: string | null;
      letter_id: string;
      permanently_removed_from_view_at?: string | null;
      restored_at?: string | null;
    }>)
      .filter((row) => row.hidden_at && !row.restored_at)
      .map((row) => row.letter_id),
  );
  const sentLetterById = new Map((sentLetters ?? []).map((letter) => [letter.id, letter]));
  const envelopeData = (Array.isArray(envelopes) ? envelopes : []).filter(
    (letter) => letter.sender_id === user.id,
  );
  const mergedEnvelopeById = new Map<string, LetterEnvelope>();

  if (!envelopesError) {
    for (const envelope of envelopeData) {
      mergedEnvelopeById.set(envelope.id, envelope);
    }
  }

  for (const letter of sentLetters) {
    if (!mergedEnvelopeById.has(letter.id)) {
      mergedEnvelopeById.set(letter.id, envelopeFromSentLetter(letter));
    }
  }

  const envelopeRows = Array.from(mergedEnvelopeById.values())
    .filter((letter) => !blockedUserIds.has(letter.recipient_id))
    .filter((letter) => !hiddenLetterIds.has(letter.id))
    .sort(
      (a, b) =>
        new Date(b.posted_at ?? b.created_at).getTime() -
        new Date(a.posted_at ?? a.created_at).getTime(),
    );
  const recipientIds = Array.from(
    new Set(envelopeRows.map((letter) => letter.recipient_id)),
  );
  const { data: profiles } = recipientIds.length
    ? await supabase.from("profiles").select("*").in("id", recipientIds)
    : { data: [] };
  const missingRecipientIds = recipientIds.filter(
    (id) => !(profiles ?? []).some((profile: ProfileRow) => profile.id === id),
  );
  const { data: fallbackProfiles } = missingRecipientIds.length
    ? await supabase.from("profiles").select("*").in("user_id", missingRecipientIds)
    : { data: [] };
  const profileById = new Map(
    [...(profiles ?? []), ...(fallbackProfiles ?? [])].flatMap(
      (profile: ProfileRow) => [
        [profile.id, profile],
        ...(profile.user_id ? [[profile.user_id, profile] as const] : []),
      ],
    ),
  );
  const deliveredCount = envelopeRows.filter(
    (letter) => letter.delivery_status === "delivered",
  ).length;
  const withdrawnCount = envelopeRows.filter(
    (letter) => letter.delivery_status === "withdrawn",
  ).length;
  const travellingCount = envelopeRows.length - deliveredCount - withdrawnCount;

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="inboxHeader" aria-labelledby="sent-title">
        <div>
          <p className="eyebrow">Scrapbooks</p>
          <h1 id="sent-title">Sent letters on their postal journeys.</h1>
          <div className="scrapbookTabs" aria-label="Scrapbook sections">
            <Link className="secondaryButton" href="/inbox">
              Inbox
            </Link>
            <Link className="button" href="/sent" aria-current="page">
              Sent
            </Link>
          </div>
        </div>
        <div className="inboxSummary">
          <div>
            <p>{travellingCount}</p>
            <span>travelling</span>
          </div>
          <div>
            <p>{deliveredCount}</p>
            <span>delivered</span>
          </div>
          <div>
            <p>{withdrawnCount}</p>
            <span>withdrawn</span>
          </div>
        </div>
      </section>

      {envelopeRows.length > 0 ? (
        <section className="postalCardGrid" aria-label="Sent letters">
          {envelopeRows.map((letter) => {
            const recipient = profileById.get(letter.recipient_id);
            const fullLetter = sentLetterById.get(letter.id);
            const isWithdrawn = letter.delivery_status === "withdrawn";
            const readStatus =
              isWithdrawn
                ? "Withdrawn"
                : letter.delivery_status === "delivered"
                ? fullLetter?.read_at
                  ? "Opened"
                  : "Delivered"
                : deliveryStatusLabel(letter.delivery_status);

            return (
              <article className="postalCard sentPostalCard" key={letter.id}>
                <div className="postalCardStamp" aria-hidden="true">
                  Sent
                </div>
                <div className="postalCardBody">
                  <p className="passportLabel">
                    {formatTrackingReference(letter)}
                  </p>
                  <h2>Letter to {displayName(recipient)}</h2>
                  <p className="scrapbookCountry">
                    {recipient?.country ?? letter.destination_country_code}
                  </p>
                  <p>{previewText(fullLetter?.body)}</p>

                  {isWithdrawn ? (
                    <p className="formMessage">
                      This letter was withdrawn before it arrived.
                    </p>
                  ) : (
                    <CompactTrackingProgress
                      destinationLabel={letter.destination_country_code}
                      letter={letter}
                      originLabel={letter.origin_country_code}
                    />
                  )}

                  <dl className="postalFacts">
                    <div>
                      <dt>Date posted</dt>
                      <dd>{formatPostedDate(letter.posted_at ?? letter.created_at)}</dd>
                    </div>
                    <div>
                      <dt>Estimated arrival</dt>
                      <dd>{formatDeliveryDate(letter.estimated_delivery_at)}</dd>
                    </div>
                    {letter.delivered_at ? (
                      <div>
                        <dt>Delivered</dt>
                        <dd>{formatDeliveryDate(letter.delivered_at)}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Status</dt>
                      <dd>{readStatus}</dd>
                    </div>
                    {letter.withdrawn_at ? (
                      <div>
                        <dt>Withdrawn</dt>
                        <dd>{formatDeliveryDate(letter.withdrawn_at)}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="postalActions">
                    {!isWithdrawn ? (
                      <Link className="button" href={`/inbox/${letter.id}`}>
                        Open Letter
                      </Link>
                    ) : null}
                    {!isWithdrawn ? <TrackLetterLink letterId={letter.id} /> : null}
                    <LetterRemovalControls
                      canWithdraw={
                        letter.sender_id === user.id &&
                        letter.delivery_status !== "delivered" &&
                        !isWithdrawn
                      }
                      letterId={letter.id}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="browseEmpty" aria-live="polite">
          <h2>You haven’t posted any letters yet.</h2>
          <p>
            When you send your first letter, you’ll be able to follow its
            journey here.
          </p>
          <div className="letterActions">
            <Link className="button" href="/browse">
              Discover Pen Pals
            </Link>
            <Link className="secondaryButton" href="/compose">
              Write a Letter
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
