import Link from "next/link";
import { signOut } from "./auth/actions";
import { isSupabaseConfigured } from "../utils/supabase/config";
import { createClient } from "../utils/supabase/server";

const navItems = [
  { href: "/dashboard", icon: "🏠", label: "Home" },
  { href: "/browse", icon: "🌍", label: "Discover" },
  { href: "/compose", icon: "✍️", label: "Write" },
  { href: "/inbox", icon: "📔", label: "Scrapbooks" },
  { href: "/profile", icon: "🛂", label: "Passport" },
  { href: "/settings/privacy", icon: "🔒", label: "Privacy" },
  { href: "/settings/reports", icon: "⚑", label: "Reports" },
];

async function canViewModeration() {
  if (!isSupabaseConfigured()) {
    return false;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    const { data, error } = await supabase.rpc("is_moderator");

    return !error && Boolean(data);
  } catch {
    return false;
  }
}

export async function AccountNav() {
  const visibleNavItems = [
    ...navItems,
    ...((await canViewModeration())
      ? [{ href: "/moderation", icon: "🛡️", label: "Moderation" }]
      : []),
  ];

  return (
    <nav className="nav dashboardNav" aria-label="Account navigation">
      <Link className="brand" href="/">
        <img className="brandMark" src="/penpals-polaroids-logo.png" alt="" />
        Penpals & Polaroids
      </Link>
      <div className="navActions">
        {visibleNavItems.map((item) => (
          <Link className="navLink" href={item.href} key={item.href}>
            <span className="navIcon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
        <form action={signOut}>
          <button className="navLink navButton" type="submit">
            Sign Out
          </button>
        </form>
      </div>
    </nav>
  );
}
