import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNav } from "../AccountNav";
import { DiscoverMap, type DiscoverProfile } from "./DiscoverMap";
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
  avatar_url?: string | null;
  photo_url?: string | null;
  profile_photo_url?: string | null;
  languages?: string[] | string | null;
  interests?: string[] | string | null;
  bio?: string | null;
  accepting_new_pen_pals?: boolean | null;
};

type LetterRow = {
  created_at: string;
  delivered_at?: string | null;
  delivery_status?: string | null;
  id: string;
  recipient_id: string;
  sender_id: string;
};

type AccountStatusRow = {
  status: "active" | "suspended";
  user_id: string;
};

export const metadata: Metadata = {
  title: "Discover | Penpals & Polaroids",
};

function listFromProfileValue(value: ProfileRow["languages"]) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function displayName(profile: ProfileRow) {
  return profile.full_name || profile.name || profile.username || "A pen pal";
}

function profileId(profile: ProfileRow) {
  return profile.user_id ?? profile.id ?? "";
}

function scrapbookHref(letter: LetterRow) {
  const isDelivered =
    letter.delivery_status === "delivered" ||
    Boolean(letter.delivered_at) ||
    !letter.delivery_status;

  return isDelivered ? `/inbox/${letter.id}` : `/letters/${letter.id}/tracking`;
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ countryPin?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { countryPin } = await searchParams;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*");

  const { data: letters } = await supabase
    .from("letters")
    .select("id,sender_id,recipient_id,created_at,delivered_at,delivery_status")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .returns<LetterRow[]>();

  const scrapbookByPenPal = new Map<string, string>();

  for (const letter of letters ?? []) {
    const penPalId =
      letter.sender_id === user.id ? letter.recipient_id : letter.sender_id;

    if (!scrapbookByPenPal.has(penPalId)) {
      scrapbookByPenPal.set(penPalId, scrapbookHref(letter));
    }
  }

  const { blockedUserIds } = await getBlockedUserIds(supabase, user.id);
  const profileIds = (profiles ?? [])
    .map((profile: ProfileRow) => profileId(profile))
    .filter(Boolean);
  const { data: accountStatuses } = profileIds.length
    ? await supabase
        .from("account_statuses")
        .select("user_id,status")
        .in("user_id", profileIds)
        .returns<AccountStatusRow[]>()
    : { data: [] };
  const suspendedUserIds = new Set(
    (accountStatuses ?? [])
      .filter((status) => status.status === "suspended")
      .map((status) => status.user_id),
  );

  const users: DiscoverProfile[] = (profiles ?? [])
    .filter((profile: ProfileRow) => {
      const id = profileId(profile);

      return id && id !== user.id && !blockedUserIds.has(id) && !suspendedUserIds.has(id);
    })
    .filter(
      (profile: ProfileRow) =>
        Boolean(profile.country) &&
        listFromProfileValue(profile.languages).length > 0 &&
        listFromProfileValue(profile.interests).length > 0 &&
        Boolean(profile.bio),
    )
    .map((profile: ProfileRow) => {
      const id = profileId(profile);

      return {
        acceptingNewPenPals: profile.accepting_new_pen_pals !== false,
        id,
        name: displayName(profile),
        country: profile.country?.trim() || "Country not listed",
        languages: listFromProfileValue(profile.languages),
        interests: listFromProfileValue(profile.interests),
        bio: profile.bio || "This pen pal has not added a bio yet.",
        photoUrl: profile.profile_photo_url ?? profile.photo_url ?? profile.avatar_url ?? undefined,
        scrapbookHref: scrapbookByPenPal.get(id),
      };
    });

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="browseHeader" aria-labelledby="browse-title">
        <div>
          <p className="eyebrow">Discover</p>
          <h1 id="browse-title">Where would you like your next letter to come from?</h1>
        </div>
        <p className="intro">
          Every pin is someone with a story to tell.
        </p>
      </section>

      {profilesError ? (
        <section className="browseEmpty" aria-live="polite">
          <h2>Passport records are not ready yet.</h2>
          <p>{profileTableMessage(profilesError)}</p>
        </section>
      ) : (
        <DiscoverMap initialSelectedCountry={countryPin} profiles={users} />
      )}
    </main>
  );
}
