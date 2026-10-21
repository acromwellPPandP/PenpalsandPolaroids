import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNav } from "../../../AccountNav";
import { LetterRemovalControls } from "../../../letters/LetterRemovalControls";
import { isSupabaseConfigured } from "../../../../utils/supabase/config";
import { createClient } from "../../../../utils/supabase/server";

type RemovedLetterRow = {
  delivered_at: string | null;
  delivery_status: string;
  direction: "Received" | "Sent";
  hidden_at: string;
  letter_id: string;
  other_country_code: string | null;
  other_user_id: string;
  permanently_removed_from_view_at: string | null;
  posted_at: string;
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
  title: "Recently Removed | Penpals & Polaroids",
};

function displayName(profile?: ProfileRow) {
  return profile?.full_name || profile?.name || profile?.username || "A pen pal";
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export default async function RecentlyRemovedPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const { message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: removedLetters, error } = await supabase
    .rpc("get_recently_removed_letters")
    .returns<RemovedLetterRow[]>();
  const rows = Array.isArray(removedLetters) ? removedLetters : [];
  const otherUserIds = Array.from(new Set(rows.map((letter) => letter.other_user_id)));
  const { data: profiles } = otherUserIds.length
    ? await supabase.from("profiles").select("*").in("id", otherUserIds).returns<ProfileRow[]>()
    : { data: [] };
  const missingProfileIds = otherUserIds.filter(
    (id) => !(profiles ?? []).some((profile) => profile.id === id),
  );
  const { data: fallbackProfiles } = missingProfileIds.length
    ? await supabase
        .from("profiles")
        .select("*")
        .in("user_id", missingProfileIds)
        .returns<ProfileRow[]>()
    : { data: [] };
  const profileById = new Map(
    [...(profiles ?? []), ...(fallbackProfiles ?? [])].flatMap((profile) => [
      [profile.id, profile],
      ...(profile.user_id ? [[profile.user_id, profile] as const] : []),
    ]),
  );

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="settingsShell" aria-labelledby="removed-title">
        <div className="settingsHeader">
          <p className="eyebrow">Settings</p>
          <h1 id="removed-title">Recently Removed</h1>
          <p className="intro">
            Letters removed from your view stay here for 30 days, so you can
            restore them if you removed one by mistake.
          </p>
          {message ? <p className="formMessage">{message}</p> : null}
          {error ? (
            <p className="formError">
              Recently Removed needs the letter removal SQL migration to be run
              in Supabase first.
            </p>
          ) : null}
          <Link className="secondaryButton" href="/settings/privacy">
            Back to Privacy
          </Link>
        </div>

        <section className="privacyPanel" aria-labelledby="removed-list-title">
          <h2 id="removed-list-title">Removed Letters</h2>
          {rows.length > 0 ? (
            <div className="removedLetterList">
              {rows.map((letter) => {
                const profile = profileById.get(letter.other_user_id);

                return (
                  <article className="removedLetterCard" key={letter.letter_id}>
                    <div>
                      <p className="passportLabel">
                        {letter.direction === "Sent" ? "Sent letter" : "Received letter"}
                      </p>
                      <h3>{displayName(profile)}</h3>
                      <p>
                        {profile?.country ?? letter.other_country_code ?? "Country hidden"}
                      </p>
                    </div>
                    <dl className="postalFacts">
                      <div>
                        <dt>Posted</dt>
                        <dd>{formatDate(letter.posted_at)}</dd>
                      </div>
                      <div>
                        <dt>Delivered</dt>
                        <dd>{formatDate(letter.delivered_at)}</dd>
                      </div>
                      <div>
                        <dt>Removed</dt>
                        <dd>{formatDate(letter.hidden_at)}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{letter.delivery_status.replaceAll("_", " ")}</dd>
                      </div>
                    </dl>
                    <LetterRemovalControls
                      canPermanentlyRemove
                      canRemove={false}
                      canRestore
                      letterId={letter.letter_id}
                    />
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="browseEmpty">
              <h2>No recently removed letters.</h2>
              <p>
                Letters you remove from your own view will appear here for a
                short time.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
