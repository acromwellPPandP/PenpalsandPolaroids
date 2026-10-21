import { redirect } from "next/navigation";
import Link from "next/link";
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

type DeliveredLetterRow = {
  body: string;
  created_at: string;
  delivered_at?: string | null;
  delivery_status?: string | null;
  id: string;
  photo_name: string;
  photo_path: string;
  posted_at?: string | null;
  read_at: string | null;
  recipient_id: string;
  sender_id: string;
};

type ProfileRow = {
  country?: string | null;
  full_name?: string | null;
  id: string;
  name?: string | null;
  username?: string | null;
};

type InboxItem = {
  envelope: LetterEnvelope;
  fullLetter?: DeliveredLetterRow;
  sender?: ProfileRow;
};

export const metadata: Metadata = {
  title: "Inbox | Penpals & Polaroids",
};

function displayName(profile?: ProfileRow) {
  return profile?.full_name || profile?.name || profile?.username || "A pen pal";
}

function previewText(body: string) {
  return body.length > 150 ? `${body.slice(0, 150)}...` : body;
}

function sortInboxItems(a: InboxItem, b: InboxItem) {
  const aDeliveredUnread =
    a.envelope.delivery_status === "delivered" && !a.fullLetter?.read_at;
  const bDeliveredUnread =
    b.envelope.delivery_status === "delivered" && !b.fullLetter?.read_at;

  if (aDeliveredUnread !== bDeliveredUnread) {
    return aDeliveredUnread ? -1 : 1;
  }

  const aTravelling = a.envelope.delivery_status !== "delivered";
  const bTravelling = b.envelope.delivery_status !== "delivered";

  if (aTravelling !== bTravelling) {
    return aTravelling ? -1 : 1;
  }

  return (
    new Date(b.envelope.posted_at ?? b.envelope.created_at).getTime() -
    new Date(a.envelope.posted_at ?? a.envelope.created_at).getTime()
  );
}

export default async function InboxPage() {
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
  const { data: envelopes } = await supabase
    .rpc("get_letter_envelopes")
    .returns<LetterEnvelope[]>();
  const incomingEnvelopes = (Array.isArray(envelopes) ? envelopes : [])
    .filter((letter) => letter.recipient_id === user.id)
    .filter((letter) => !blockedUserIds.has(letter.sender_id));
  const deliveredIds = incomingEnvelopes
    .filter((letter) => letter.delivery_status === "delivered")
    .map((letter) => letter.id);
  const { data: deliveredLetters } = deliveredIds.length
    ? await supabase
        .from("letters")
        .select("id,sender_id,recipient_id,body,photo_name,photo_path,created_at,read_at,delivered_at,delivery_status,posted_at")
        .eq("recipient_id", user.id)
        .eq("delivery_status", "delivered")
        .not("delivered_at", "is", null)
        .in("id", deliveredIds)
        .returns<DeliveredLetterRow[]>()
    : { data: [] };
  const deliveredLetterById = new Map(
    (deliveredLetters ?? []).map((letter) => [letter.id, letter]),
  );
  const senderIds = Array.from(
    new Set(incomingEnvelopes.map((letter) => letter.sender_id)),
  );
  const { data: senderProfiles } = senderIds.length
    ? await supabase.from("profiles").select("*").in("id", senderIds)
    : { data: [] };
  const profileById = new Map(
    (senderProfiles ?? []).map((profile: ProfileRow) => [profile.id, profile]),
  );
  const inboxItems = incomingEnvelopes
    .map((envelope) => ({
      envelope,
      fullLetter: deliveredLetterById.get(envelope.id),
      sender: profileById.get(envelope.sender_id),
    }))
    .sort(sortInboxItems);
  const travellingCount = inboxItems.filter(
    (item) => item.envelope.delivery_status !== "delivered",
  ).length;
  const arrivedCount = inboxItems.filter(
    (item) => item.envelope.delivery_status === "delivered",
  ).length;
  const unopenedCount = inboxItems.filter(
    (item) => item.envelope.delivery_status === "delivered" && !item.fullLetter?.read_at,
  ).length;

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="inboxHeader" aria-labelledby="inbox-title">
        <div>
          <p className="eyebrow">Scrapbooks</p>
          <h1 id="inbox-title">Incoming letters and sealed journeys.</h1>
          <div className="scrapbookTabs" aria-label="Scrapbook sections">
            <Link className="button" href="/inbox" aria-current="page">
              Inbox
            </Link>
            <Link className="secondaryButton" href="/sent">
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
            <p>{arrivedCount}</p>
            <span>arrived</span>
          </div>
          <div>
            <p>{unopenedCount}</p>
            <span>unopened</span>
          </div>
        </div>
      </section>

      {inboxItems.length > 0 ? (
        <section className="postalCardGrid" aria-label="Incoming letters">
          {inboxItems.map(({ envelope, fullLetter, sender }) => {
            const isDelivered = envelope.delivery_status === "delivered";
            const senderName = displayName(sender);

            return (
              <article
                className="postalCard incomingPostalCard"
                data-delivered={isDelivered}
                key={envelope.id}
              >
                <div className="postalCardStamp" aria-hidden="true">
                  {isDelivered ? "Arrived" : "Sealed"}
                </div>
                <div className="postalCardBody">
                  <p className="passportLabel">
                    {formatTrackingReference(envelope)}
                  </p>
                  <h2>
                    {isDelivered
                      ? "Your letter has arrived"
                      : `A letter from ${sender?.country ?? envelope.origin_country_code} is on its way`}
                  </h2>
                  <p className="scrapbookCountry">
                    From {senderName}
                    {sender?.country ? ` in ${sender.country}` : ""}
                  </p>
                  <p>
                    {isDelivered && fullLetter
                      ? previewText(fullLetter.body)
                      : "This letter will remain sealed until it arrives."}
                  </p>

                  <CompactTrackingProgress
                    destinationLabel={envelope.destination_country_code}
                    letter={envelope}
                    originLabel={envelope.origin_country_code}
                  />

                  <dl className="postalFacts">
                    <div>
                      <dt>Date posted</dt>
                      <dd>{formatPostedDate(envelope.posted_at ?? envelope.created_at)}</dd>
                    </div>
                    <div>
                      <dt>Estimated arrival</dt>
                      <dd>{formatDeliveryDate(envelope.estimated_delivery_at)}</dd>
                    </div>
                    {envelope.delivered_at ? (
                      <div>
                        <dt>Delivered</dt>
                        <dd>{formatDeliveryDate(envelope.delivered_at)}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Status</dt>
                      <dd>{deliveryStatusLabel(envelope.delivery_status)}</dd>
                    </div>
                  </dl>

                  <div className="postalActions">
                    {isDelivered ? (
                      <>
                        <Link className="button" href={`/inbox/${envelope.id}`}>
                          Open Letter
                        </Link>
                        <Link className="secondaryButton" href={`/inbox/${envelope.id}`}>
                          View Scrapbook
                        </Link>
                        <TrackLetterLink letterId={envelope.id} />
                        <LetterRemovalControls letterId={envelope.id} />
                      </>
                    ) : (
                      <>
                        <TrackLetterLink className="button" letterId={envelope.id} />
                        <LetterRemovalControls letterId={envelope.id} />
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="browseEmpty" aria-live="polite">
          <h2>No letters are travelling your way yet.</h2>
          <p>
            When a pen pal posts a letter to you, its journey will appear here.
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
