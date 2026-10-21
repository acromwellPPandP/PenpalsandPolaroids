import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { AccountNav } from "../AccountNav";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { createClient } from "../../utils/supabase/server";

export const metadata: Metadata = {
  title: "Home | Penpals & Polaroids",
};

export default async function DashboardPage() {
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

  return (
    <main className="dashboardPage dashboardLandingPage">
      <AccountNav />

      <section className="dashboardHero" aria-labelledby="dashboard-title">
        <p className="eyebrow">Home</p>
        <h1 id="dashboard-title">Ready to send a thoughtful first letter?</h1>
        <p className="intro">
          You are signed in as {user.email}. Next, this space can hold matching,
          letter drafts, and the single photo you choose for each exchange.
        </p>
        <div className="actions">
          <Link className="button" href="/inbox">
            Open Scrapbooks
          </Link>
          <Link className="button" href="/compose">
            Write Letter
          </Link>
          <Link className="button" href="/browse">
            Discover Pen Pals
          </Link>
          <Link className="button" href="/profile">
            Complete Passport
          </Link>
        </div>
      </section>
    </main>
  );
}
