import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNav } from "../../AccountNav";
import { unblockUser } from "../../safety/actions";
import { isSupabaseConfigured } from "../../../utils/supabase/config";
import { createClient } from "../../../utils/supabase/server";

type BlockRow = {
  blocked_user_id: string;
  created_at: string;
  id: string;
};

type LegacyBlockRow = {
  blocked_id: string;
  created_at?: string | null;
  blocker_id: string;
};

type VisibleBlock = {
  blocked_user_id: string;
  created_at: string;
  id: string;
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
  title: "Privacy | Penpals & Polaroids",
};

function displayName(profile?: ProfileRow) {
  return profile?.full_name || profile?.name || profile?.username || "A pen pal";
}

export default async function PrivacySettingsPage({
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

  const { data: phaseOneBlocks } = await supabase
    .from("blocked_users")
    .select("id,blocked_user_id,created_at")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false })
    .returns<BlockRow[]>();
  const { data: legacyBlocks } = await supabase
    .from("blocks")
    .select("blocker_id,blocked_id,created_at")
    .eq("blocker_id", user.id)
    .returns<LegacyBlockRow[]>();
  const blocksByUser = new Map<string, VisibleBlock>();

  for (const block of phaseOneBlocks ?? []) {
    blocksByUser.set(block.blocked_user_id, block);
  }

  for (const block of legacyBlocks ?? []) {
    if (!blocksByUser.has(block.blocked_id)) {
      blocksByUser.set(block.blocked_id, {
        blocked_user_id: block.blocked_id,
        created_at: block.created_at ?? new Date().toISOString(),
        id: `${block.blocker_id}-${block.blocked_id}`,
      });
    }
  }

  const blocks = Array.from(blocksByUser.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const blockedIds = blocks.map((block) => block.blocked_user_id);
  const { data: profiles } = blockedIds.length
    ? await supabase.from("profiles").select("*").in("id", blockedIds).returns<ProfileRow[]>()
    : { data: [] };
  const missingProfileIds = blockedIds.filter(
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

      <section className="settingsShell" aria-labelledby="privacy-title">
        <div className="settingsHeader">
          <p className="eyebrow">Settings</p>
          <h1 id="privacy-title">Privacy</h1>
          <p className="intro">
            Manage blocked Passports. Blocking is private and does not notify
            the other person.
          </p>
          {message ? <p className="formMessage">{message}</p> : null}
          <Link className="secondaryButton" href="/settings/privacy/removed">
            Recently Removed Letters
          </Link>
        </div>

        <section className="privacyPanel" aria-labelledby="blocked-users-title">
          <h2 id="blocked-users-title">Blocked Users</h2>
          {blocks.length > 0 ? (
            <div className="blockedUserList">
              {blocks.map((block) => {
                const profile = profileById.get(block.blocked_user_id);

                return (
                  <article className="blockedUserCard" key={block.id}>
                    <div>
                      <h3>{displayName(profile)}</h3>
                      <p>
                        {profile?.country ?? "Country hidden"} · Blocked{" "}
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                        }).format(new Date(block.created_at))}
                      </p>
                    </div>
                    <form action={unblockUser}>
                      <input
                        name="blockedUserId"
                        type="hidden"
                        value={block.blocked_user_id}
                      />
                      <button className="secondaryButton" type="submit">
                        Unblock
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="browseEmpty">
              <h2>No blocked users.</h2>
              <p>
                Passports you block will appear here so you can unblock them
                later.
              </p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
