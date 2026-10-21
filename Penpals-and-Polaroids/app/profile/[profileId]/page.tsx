import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccountNav } from "../../AccountNav";
import { SafetyActions } from "../../safety/SafetyActions";
import { areUsersBlocked } from "../../safety/blocking";
import { isSupabaseConfigured } from "../../../utils/supabase/config";
import { createClient } from "../../../utils/supabase/server";

type ProfileRow = {
  avatar_url?: string | null;
  bio?: string | null;
  country?: string | null;
  full_name?: string | null;
  id: string;
  interests?: string[] | string | null;
  languages?: string[] | string | null;
  name?: string | null;
  photo_url?: string | null;
  profile_photo_url?: string | null;
  username?: string | null;
};

export const metadata: Metadata = {
  title: "Passport | Penpals & Polaroids",
};

function displayName(profile: ProfileRow) {
  return profile.full_name || profile.name || profile.username || "A pen pal";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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

export default async function PublicPassportPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const { profileId } = await params;
  const { message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (profileId === user.id) {
    redirect("/profile");
  }

  const { blocked } = await areUsersBlocked(supabase, user.id, profileId);

  if (blocked) {
    notFound();
  }

  const { data: accountStatus } = await supabase
    .from("account_statuses")
    .select("status")
    .eq("user_id", profileId)
    .maybeSingle<{ status: "active" | "suspended" }>();

  if (accountStatus?.status === "suspended") {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle<ProfileRow>();

  if (!profile) {
    notFound();
  }

  const name = displayName(profile);
  const photo = profile.profile_photo_url ?? profile.photo_url ?? profile.avatar_url;
  const languages = listFromProfileValue(profile.languages);
  const interests = listFromProfileValue(profile.interests);

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="publicPassportShell" aria-labelledby="public-passport-title">
        <div>
          <p className="eyebrow">Passport</p>
          <h1 id="public-passport-title">{name}</h1>
          <p className="intro">
            A country-level Passport preview for thoughtful letter writing.
          </p>
          {message ? <p className="formMessage">{message}</p> : null}
          <SafetyActions reportedUserId={profile.id} userName={name} />
        </div>

        <article className="passportBook publicPassportBook" aria-label={`${name} Passport`}>
          <div className="passportCover">
            <span>Penpals & Polaroids</span>
            <strong>Passport</strong>
          </div>
          <div className="passportPage">
            <div className="passportTopline">
              <span>Digital passport</span>
              <span>{profile.country || "Country pending"}</span>
            </div>
            <div className="passportIdentity">
              <div className="passportPhoto">
                {photo ? (
                  <img src={photo} alt={`${name} passport photo`} />
                ) : (
                  <span>{initials(name)}</span>
                )}
              </div>
              <div>
                <p className="passportLabel">Name</p>
                <h2>{name}</h2>
                <p className="passportCountry">{profile.country || "Country pending"}</p>
              </div>
            </div>

            <div className="passportSection">
              <p className="passportLabel">Languages</p>
              <div className="passportChips">
                {languages.map((language) => (
                  <span key={language}>{language}</span>
                ))}
              </div>
            </div>

            <div className="passportSection">
              <p className="passportLabel">Interests</p>
              <div className="passportChips">
                {interests.map((interest) => (
                  <span key={interest}>{interest}</span>
                ))}
              </div>
            </div>

            <div className="passportBio">
              <p className="passportLabel">Short bio</p>
              <p>{profile.bio}</p>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
