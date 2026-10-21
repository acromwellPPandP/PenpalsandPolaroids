import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { AccountNav } from "../../../AccountNav";
import { reconcileDeliveries } from "../../delivery";
import { isSupabaseConfigured } from "../../../../utils/supabase/config";
import { createClient } from "../../../../utils/supabase/server";

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
};

type TrackingEvent = {
  event_country_code?: string | null;
  event_description: string;
  event_label: string;
  id: string;
  occurred_at?: string | null;
  scheduled_at: string;
  status: string;
};

type ProfileRow = {
  country?: string | null;
  full_name?: string | null;
  id: string;
  name?: string | null;
  username?: string | null;
};

export const metadata: Metadata = {
  title: "Track Letter | Penpals & Polaroids",
};

function displayName(profile?: ProfileRow | null) {
  return profile?.full_name || profile?.name || profile?.username || "A pen pal";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function progressPercent(letter: LetterEnvelope) {
  if (letter.delivery_status === "delivered") {
    return 100;
  }

  const posted = new Date(letter.posted_at).getTime();
  const estimated = new Date(letter.estimated_delivery_at).getTime();
  const now = Date.now();

  if (estimated <= posted) {
    return 100;
  }

  return Math.max(0, Math.min(96, Math.round(((now - posted) / (estimated - posted)) * 100)));
}

export default async function TrackingPage({
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

  const { data: envelopes } = await supabase
    .rpc("get_letter_envelope", { letter_uuid: letterId })
    .returns<LetterEnvelope[]>();
  const envelopeRows = (envelopes ?? []) as unknown as LetterEnvelope[];
  const letter = envelopeRows[0];

  if (!letter) {
    notFound();
  }

  const participantIds = [letter.sender_id, letter.recipient_id];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", participantIds)
    .returns<ProfileRow[]>();
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const senderProfile = profileById.get(letter.sender_id);
  const recipientProfile = profileById.get(letter.recipient_id);
  const { data: events } = await supabase
    .from("letter_tracking_events")
    .select("id,status,event_label,event_description,event_country_code,scheduled_at,occurred_at")
    .eq("letter_id", letter.id)
    .order("scheduled_at", { ascending: true })
    .returns<TrackingEvent[]>();
  const progress = progressPercent(letter);

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="trackingShell" aria-labelledby="tracking-title">
        <div className="trackingReceipt">
          <p className="eyebrow">Virtual postal tracking</p>
          <h1 id="tracking-title">Your letter is travelling</h1>
          <p className="intro">
            Good letters take time. Follow its journey while it makes its way
            across the world.
          </p>
          {message ? <p className="formMessage">{message}</p> : null}

          <dl className="trackingFacts">
            <div>
              <dt>Tracking reference</dt>
              <dd>{letter.tracking_reference}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>{displayName(senderProfile)} · {letter.origin_country_code}</dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>{displayName(recipientProfile)} · {letter.destination_country_code}</dd>
            </div>
            <div>
              <dt>Date posted</dt>
              <dd>{new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(letter.posted_at))}</dd>
            </div>
            <div>
              <dt>Estimated arrival</dt>
              <dd>{new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(letter.estimated_delivery_at))}</dd>
            </div>
            <div>
              <dt>Current status</dt>
              <dd>{statusLabel(letter.delivery_status)}</dd>
            </div>
          </dl>

          <div
            className="routeProgress"
            aria-label={`Virtual route from ${letter.origin_country_code} to ${letter.destination_country_code}, ${progress}% complete`}
          >
            <span>{letter.origin_country_code}</span>
            <div className="routeLine">
              <i style={{ left: `${progress}%` }}>✉</i>
            </div>
            <span>{letter.destination_country_code}</span>
          </div>

          {letter.delivery_status === "delivered" ? (
            <Link className="button" href={`/inbox/${letter.id}`}>
              Open Scrapbook Page
            </Link>
          ) : (
            <p className="formMessage">
              This letter remains sealed until it reaches your pen pal.
            </p>
          )}
        </div>

        <section className="trackingTimeline" aria-label="Tracking timeline">
          {(events ?? []).map((event) => (
            <article className="trackingEvent" data-complete={Boolean(event.occurred_at)} key={event.id}>
              <p className="passportLabel">{event.event_label}</p>
              <h2>{statusLabel(event.status)}</h2>
              <p>{event.event_description}</p>
              <time dateTime={event.occurred_at ?? event.scheduled_at}>
                {event.occurred_at ? "Reached " : "Expected "}
                {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(event.occurred_at ?? event.scheduled_at),
                )}
              </time>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
