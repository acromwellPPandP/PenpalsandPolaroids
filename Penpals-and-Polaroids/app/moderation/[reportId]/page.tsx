import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AccountNav } from "../../AccountNav";
import { ModerationControls } from "../ModerationControls";
import { requireModerator } from "../auth";

type ReportRow = {
  category: string;
  created_at: string;
  description?: string | null;
  id: string;
  letter_id?: string | null;
  reported_user_id: string;
  reporter_id: string;
  scrapbook_id?: string | null;
  status: string;
};

type ProfileRow = {
  bio?: string | null;
  country?: string | null;
  full_name?: string | null;
  id: string;
  interests?: string | null;
  languages?: string | null;
  name?: string | null;
  username?: string | null;
};

type LetterRow = {
  body: string;
  created_at: string;
  id: string;
  photo_name: string;
  photo_path: string;
  recipient_id: string;
  sender_id: string;
};

type WarningRow = {
  created_at: string;
  id: string;
  notes?: string | null;
  reason: string;
};

type AuditRow = {
  action: string;
  created_at: string;
  id: string;
  reason?: string | null;
};

export const metadata: Metadata = {
  title: "Report Review | Penpals & Polaroids",
};

function displayName(profile?: ProfileRow | null) {
  return profile?.full_name || profile?.name || profile?.username || "A pen pal";
}

export default async function ModerationReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { reportId } = await params;
  const { message } = await searchParams;
  const { supabase } = await requireModerator();
  const { data: report } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle<ReportRow>();

  if (!report) {
    notFound();
  }

  const participantIds = [report.reporter_id, report.reported_user_id];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", participantIds)
    .returns<ProfileRow[]>();
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const reporter = profileById.get(report.reporter_id);
  const reported = profileById.get(report.reported_user_id);
  const { data: letter } = report.letter_id
    ? await supabase
        .from("letters")
        .select("id,sender_id,recipient_id,body,photo_name,photo_path,created_at")
        .eq("id", report.letter_id)
        .maybeSingle<LetterRow>()
    : { data: null };
  const { data: photo } = letter?.photo_path
    ? await supabase.storage.from("letter-photos").createSignedUrl(letter.photo_path, 60 * 10)
    : { data: null };
  const { data: previousReports } = await supabase
    .from("reports")
    .select("id,category,status,created_at")
    .eq("reported_user_id", report.reported_user_id)
    .neq("id", report.id)
    .order("created_at", { ascending: false })
    .limit(8)
    .returns<ReportRow[]>();
  const { data: warnings } = await supabase
    .from("account_warnings")
    .select("id,reason,notes,created_at")
    .eq("user_id", report.reported_user_id)
    .order("created_at", { ascending: false })
    .returns<WarningRow[]>();
  const { data: auditRows } = await supabase
    .from("moderation_audit_log")
    .select("id,action,reason,created_at")
    .eq("target_user_id", report.reported_user_id)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<AuditRow[]>();

  return (
    <main className="dashboardPage">
      <AccountNav />

      <section className="moderationShell" aria-labelledby="report-title">
        <div className="moderationHero">
          <p className="eyebrow">Report review</p>
          <h1 id="report-title">{report.category.replace("_", " ")}</h1>
          <p className="intro">
            Submitted{" "}
            {new Intl.DateTimeFormat("en", {
              dateStyle: "long",
              timeStyle: "short",
            }).format(new Date(report.created_at))}{" "}
            · {report.status.replace("_", " ")}
          </p>
          {message ? <p className="formMessage">{message}</p> : null}
          <Link className="secondaryButton" href="/moderation">
            Back to moderation
          </Link>
        </div>

        <div className="moderationDetailGrid">
          <section className="moderationPanel">
            <h2>People</h2>
            <dl className="moderationDefinitionList">
              <div>
                <dt>Reporter</dt>
                <dd>{displayName(reporter)}</dd>
              </div>
              <div>
                <dt>Reported user</dt>
                <dd>{displayName(reported)}</dd>
              </div>
              <div>
                <dt>Passport</dt>
                <dd>
                  <Link href={`/profile/${report.reported_user_id}`}>Open Passport</Link>
                </dd>
              </div>
            </dl>
          </section>

          <section className="moderationPanel">
            <h2>Report</h2>
            <p>{report.description || "No description provided."}</p>
            {report.letter_id ? <p>Linked Letter: {report.letter_id}</p> : null}
            {report.scrapbook_id ? <p>Linked Scrapbook: {report.scrapbook_id}</p> : null}
          </section>

          <section className="moderationPanel">
            <h2>Reported Passport</h2>
            <p><strong>{displayName(reported)}</strong></p>
            <p>{reported?.country || "Country not listed"}</p>
            <p>{reported?.languages || "Languages not listed"}</p>
            <p>{reported?.interests || "Interests not listed"}</p>
            <p>{reported?.bio || "No bio."}</p>
          </section>

          {letter ? (
            <section className="moderationPanel moderationLetterPanel">
              <h2>Linked Letter</h2>
              <p>{letter.body}</p>
              {photo?.signedUrl ? (
                <figure className="moderationPolaroid">
                  <img src={photo.signedUrl} alt={letter.photo_name} />
                  <figcaption>{letter.photo_name}</figcaption>
                </figure>
              ) : null}
            </section>
          ) : null}

          <section className="moderationPanel">
            <h2>Previous reports</h2>
            {(previousReports ?? []).length ? (
              <ul className="plainList">
                {(previousReports ?? []).map((previous) => (
                  <li key={previous.id}>{previous.category} · {previous.status}</li>
                ))}
              </ul>
            ) : (
              <p className="mutedText">No previous reports.</p>
            )}
          </section>

          <section className="moderationPanel">
            <h2>Moderation history</h2>
            {(warnings ?? []).length || (auditRows ?? []).length ? (
              <ul className="plainList">
                {(warnings ?? []).map((warning) => (
                  <li key={warning.id}>Warning: {warning.reason}</li>
                ))}
                {(auditRows ?? []).map((audit) => (
                  <li key={audit.id}>{audit.action.replace("_", " ")} · {audit.reason}</li>
                ))}
              </ul>
            ) : (
              <p className="mutedText">No moderation history yet.</p>
            )}
          </section>

          <ModerationControls
            reportId={report.id}
            targetUserId={report.reported_user_id}
          />
        </div>
      </section>
    </main>
  );
}
