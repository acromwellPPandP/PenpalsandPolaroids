import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNav } from "../../AccountNav";
import { isSupabaseConfigured } from "../../../utils/supabase/config";
import { createClient } from "../../../utils/supabase/server";

type ReportRow = {
  category: string;
  created_at: string;
  id: string;
  status: "pending" | "under_review" | "resolved" | "dismissed";
};

export const metadata: Metadata = {
  title: "My Reports | Penpals & Polaroids",
};

function statusLabel(status: ReportRow["status"]) {
  if (status === "under_review") {
    return "Under Review";
  }

  return status[0].toUpperCase() + status.slice(1);
}

export default async function MyReportsPage() {
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

  const { data: reports } = await supabase
    .from("reports")
    .select("id,category,status,created_at")
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false })
    .returns<ReportRow[]>();

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="settingsShell" aria-labelledby="my-reports-title">
        <div className="settingsHeader">
          <p className="eyebrow">Settings</p>
          <h1 id="my-reports-title">My Reports</h1>
          <p className="intro">
            Review the status of reports you have submitted. Moderator notes
            and internal actions remain private.
          </p>
        </div>

        <section className="privacyPanel" aria-label="Submitted reports">
          {(reports ?? []).length ? (
            <div className="blockedUserList">
              {(reports ?? []).map((report) => (
                <article className="blockedUserCard" key={report.id}>
                  <div>
                    <h3>{report.category.replace("_", " ")}</h3>
                    <p>
                      Submitted{" "}
                      {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                        new Date(report.created_at),
                      )}
                    </p>
                  </div>
                  <strong className="statusPill">{statusLabel(report.status)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <div className="browseEmpty">
              <h2>No reports submitted.</h2>
              <p>Reports you submit will appear here with their current status.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
