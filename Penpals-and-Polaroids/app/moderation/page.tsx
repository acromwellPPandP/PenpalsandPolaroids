import Link from "next/link";
import type { Metadata } from "next";
import { AccountNav } from "../AccountNav";
import { requireModerator } from "./auth";

type ReportRow = {
  category: string;
  created_at: string;
  description?: string | null;
  id: string;
  reported_user_id: string;
  reporter_id: string;
  status: "pending" | "under_review" | "resolved" | "dismissed";
};

type AccountStatusRow = {
  status: "active" | "suspended";
};

type WarningRow = {
  id: string;
};

function labelStatus(status: ReportRow["status"]) {
  return status.replace("_", " ");
}

export const metadata: Metadata = {
  title: "Moderation | Penpals & Polaroids",
};

export default async function ModerationPage() {
  const { supabase } = await requireModerator();
  const { data: reports } = await supabase
    .from("reports")
    .select("id,reporter_id,reported_user_id,category,description,status,created_at")
    .order("created_at", { ascending: false })
    .returns<ReportRow[]>();
  const { data: accountStatuses } = await supabase
    .from("account_statuses")
    .select("status")
    .eq("status", "suspended")
    .returns<AccountStatusRow[]>();
  const { data: warnings } = await supabase
    .from("account_warnings")
    .select("id")
    .returns<WarningRow[]>();

  const reportRows = reports ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const counts = {
    dismissed: reportRows.filter((report) => report.status === "dismissed").length,
    pending: reportRows.filter((report) => report.status === "pending").length,
    resolved: reportRows.filter((report) => report.status === "resolved").length,
    underReview: reportRows.filter((report) => report.status === "under_review").length,
  };
  const reportsToday = reportRows.filter((report) =>
    report.created_at.startsWith(today),
  ).length;

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="moderationShell" aria-labelledby="moderation-title">
        <div className="moderationHero">
          <p className="eyebrow">Moderation</p>
          <h1 id="moderation-title">Community safety desk.</h1>
          <p className="intro">
            Review reports, protect members, and keep Penpals & Polaroids calm
            and welcoming.
          </p>
        </div>

        <section className="moderationStats" aria-label="Moderation dashboard counts">
          <article>
            <span>{counts.pending}</span>
            <p>Pending Reports</p>
          </article>
          <article>
            <span>{counts.underReview}</span>
            <p>Under Review</p>
          </article>
          <article>
            <span>{counts.resolved}</span>
            <p>Resolved</p>
          </article>
          <article>
            <span>{counts.dismissed}</span>
            <p>Dismissed</p>
          </article>
          <article>
            <span>{accountStatuses?.length ?? 0}</span>
            <p>Users Suspended</p>
          </article>
          <article>
            <span>{warnings?.length ?? 0}</span>
            <p>Warnings Issued</p>
          </article>
          <article>
            <span>{reportsToday}</span>
            <p>Reports Today</p>
          </article>
        </section>

        <section className="moderationColumns">
          <article className="moderationPanel">
            <h2>Newest Reports</h2>
            <div className="reportList">
              {reportRows.slice(0, 6).map((report) => (
                <Link
                  className="reportListItem"
                  href={`/moderation/${report.id}`}
                  key={report.id}
                >
                  <strong>{report.category.replace("_", " ")}</strong>
                  <span>{labelStatus(report.status)}</span>
                </Link>
              ))}
              {!reportRows.length ? <p className="mutedText">No reports yet.</p> : null}
            </div>
          </article>
          <article className="moderationPanel">
            <h2>Quick Actions</h2>
            <div className="reportList">
              <Link className="reportListItem" href="/moderation">
                <strong>Review pending queue</strong>
                <span>{counts.pending} waiting</span>
              </Link>
              <Link className="reportListItem" href="/settings/reports">
                <strong>View my report status page</strong>
                <span>User-facing status view</span>
              </Link>
            </div>
          </article>
          {(["pending", "under_review", "resolved", "dismissed"] as const).map(
            (status) => (
              <article className="moderationPanel" key={status}>
                <h2>{labelStatus(status)}</h2>
                <div className="reportList">
                  {reportRows.filter((report) => report.status === status).length ? (
                    reportRows
                      .filter((report) => report.status === status)
                      .slice(0, 8)
                      .map((report) => (
                        <Link
                          className="reportListItem"
                          href={`/moderation/${report.id}`}
                          key={report.id}
                        >
                          <strong>{report.category.replace("_", " ")}</strong>
                          <span>
                            {new Intl.DateTimeFormat("en", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(report.created_at))}
                          </span>
                        </Link>
                      ))
                  ) : (
                    <p className="mutedText">No reports in this section.</p>
                  )}
                </div>
              </article>
            ),
          )}
        </section>
      </section>
    </main>
  );
}
