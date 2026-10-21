import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNav } from "../AccountNav";
import { updateProfile } from "./actions";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { profileTableMessage } from "../../utils/supabase/errors";
import { createClient } from "../../utils/supabase/server";

type ProfileRow = {
  bio?: string;
  country?: string;
  interests?: string;
  languages?: string;
  updated_at?: string;
};

export const metadata: Metadata = {
  title: "Passport | Penpals & Polaroids",
};

type LetterRow = {
  photo_path?: string | null;
  recipient_id: string;
  sender_id: string;
};

type ConnectedProfileRow = {
  country?: string | null;
  id: string;
};

function profileValue(value: string | null | undefined) {
  return value ?? "";
}

function splitList(value: string | null | undefined) {
  return profileValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function displayName(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata ?? {};
  const name =
    metadata.full_name ||
    metadata.name ||
    metadata.user_name ||
    metadata.username ||
    user.email?.split("@")[0];

  return typeof name === "string" && name.trim() ? name : "Passport holder";
}

function avatarUrl(user: { user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  const image = metadata.avatar_url || metadata.picture || metadata.photo_url;

  return typeof image === "string" && image.trim() ? image : "";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "New member";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { message } = await searchParams;

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("country,languages,interests,bio,updated_at")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();
  const { data: letters } = await supabase
    .from("letters")
    .select("sender_id,recipient_id,photo_path")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);
  const { data: accountStatus } = await supabase
    .from("account_statuses")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle<{ status: "active" | "suspended" }>();
  const letterRows = (letters ?? []) as LetterRow[];
  const sentLetters = letterRows.filter((letter) => letter.sender_id === user.id);
  const connectedUserIds = Array.from(
    new Set(
      letterRows
        .map((letter) =>
          letter.sender_id === user.id ? letter.recipient_id : letter.sender_id,
        )
        .filter((id) => id && id !== user.id),
    ),
  );
  const { data: connectedProfiles } = connectedUserIds.length
    ? await supabase
        .from("profiles")
        .select("id,country")
        .in("id", connectedUserIds)
    : { data: [] };
  const countriesConnected = new Set(
    ((connectedProfiles ?? []) as ConnectedProfileRow[])
      .map((connectedProfile) => connectedProfile.country)
      .filter(Boolean),
  ).size;
  const name = displayName(user);
  const photo = avatarUrl(user);
  const languageList = splitList(profile?.languages);
  const interestList = splitList(profile?.interests);
  const isSuspended = accountStatus?.status === "suspended";

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="profileShell" aria-labelledby="profile-title">
        <div className="profileIntro">
          <p className="eyebrow">Passport</p>
          <h1 id="profile-title">Your Passport.</h1>
          <p className="intro">
            Keep the details that help a good letter find you: where you are
            writing from, the languages you use, and the little things you love.
          </p>

          <article className="passportBook" aria-label="Passport preview">
            <div className="passportCover">
              <span>Penpals & Polaroids</span>
              <strong>Passport</strong>
            </div>
            <div className="passportPage">
              <div className="passportTopline">
                <span>Digital passport</span>
                <span>{profile?.country || "Country pending"}</span>
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
                  <p className="passportCountry">
                    {profile?.country || "Add your country"}
                  </p>
                </div>
              </div>

              <dl className="passportDetails">
                <div>
                  <dt>Member since</dt>
                  <dd>{formatDate(user.created_at)}</dd>
                </div>
                <div>
                  <dt>Letters sent</dt>
                  <dd>{sentLetters.length}</dd>
                </div>
                <div>
                  <dt>Polaroids shared</dt>
                  <dd>
                    {sentLetters.filter((letter) => Boolean(letter.photo_path)).length}
                  </dd>
                </div>
                <div>
                  <dt>Countries connected</dt>
                  <dd>{countriesConnected}</dd>
                </div>
              </dl>

              <div className="passportSection">
                <p className="passportLabel">Languages</p>
                <div className="passportChips">
                  {languageList.length ? (
                    languageList.map((language) => (
                      <span key={language}>{language}</span>
                    ))
                  ) : (
                    <span>Add languages</span>
                  )}
                </div>
              </div>

              <div className="passportSection">
                <p className="passportLabel">Interests</p>
                <div className="passportChips">
                  {interestList.length ? (
                    interestList.map((interest) => (
                      <span key={interest}>{interest}</span>
                    ))
                  ) : (
                    <span>Add interests</span>
                  )}
                </div>
              </div>

              <div className="passportBio">
                <p className="passportLabel">Short bio</p>
                <p>{profile?.bio || "Write a short introduction for future pen pals."}</p>
              </div>
            </div>
          </article>
        </div>

        {isSuspended ? (
          <section className="profileForm" aria-live="polite">
            <div className="profileFormHeader">
              <p className="eyebrow">Account unavailable</p>
              <h2>Your account is currently unavailable while it is under review.</h2>
            </div>
            <p className="formMessage">
              Passport editing and new letters are disabled for now.
            </p>
          </section>
        ) : (
        <form className="profileForm" action={updateProfile}>
          <div className="profileFormHeader">
            <p className="eyebrow">Edit passport</p>
            <h2>Passport details</h2>
          </div>

          {profileError ? (
            <p className="formMessage">
              {profileTableMessage(profileError)}
            </p>
          ) : null}

          <label htmlFor="country">Country</label>
          <input
            id="country"
            name="country"
            placeholder="Japan"
            defaultValue={profileValue(profile?.country)}
            required
          />

          <label htmlFor="languages">Languages</label>
          <input
            id="languages"
            name="languages"
            placeholder="English, Japanese, Spanish"
            defaultValue={profileValue(profile?.languages)}
            required
          />

          <label htmlFor="interests">Interests</label>
          <input
            id="interests"
            name="interests"
            placeholder="Film photography, cooking, city walks"
            defaultValue={profileValue(profile?.interests)}
            required
          />

          <label htmlFor="bio">Short bio</label>
          <textarea
            id="bio"
            name="bio"
            placeholder="Tell future penpals a little about your everyday life."
            defaultValue={profileValue(profile?.bio)}
            maxLength={280}
            required
          />

          {message ? <p className="formMessage">{message}</p> : null}

          <button className="button authButton" type="submit">
            Save Passport
          </button>
        </form>
        )}
      </section>
    </main>
  );
}
