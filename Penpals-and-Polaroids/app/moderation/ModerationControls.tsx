"use client";

import {
  dismissReport,
  issueWarning,
  markReviewing,
  resolveReport,
  restoreUser,
  suspendUser,
} from "./actions";

export function ModerationControls({
  reportId,
  targetUserId,
}: {
  reportId: string;
  targetUserId: string;
}) {
  function confirmAction(message: string) {
    return window.confirm(message);
  }

  return (
    <section className="moderationPanel" aria-labelledby="moderation-actions-title">
      <h2 id="moderation-actions-title">Actions</h2>
      <form className="moderationActionForm">
        <input name="reportId" type="hidden" value={reportId} />
        <input name="targetUserId" type="hidden" value={targetUserId} />

        <label htmlFor="moderation-reason">Reason</label>
        <input
          id="moderation-reason"
          name="reason"
          placeholder="Short reason for warning, suspension, or restore"
        />

        <label htmlFor="moderation-notes">Moderator notes</label>
        <textarea
          id="moderation-notes"
          name="notes"
          placeholder="Private notes for moderators only"
        />

        <div className="moderationButtonGrid">
          <button
            className="secondaryButton"
            formAction={markReviewing}
            type="submit"
            onClick={(event) => {
              if (!confirmAction("Mark this report as under review?")) {
                event.preventDefault();
              }
            }}
          >
            Mark Reviewing
          </button>
          <button
            className="button"
            formAction={resolveReport}
            type="submit"
            onClick={(event) => {
              if (!confirmAction("Resolve this report?")) {
                event.preventDefault();
              }
            }}
          >
            Resolve Report
          </button>
          <button
            className="secondaryButton"
            formAction={dismissReport}
            type="submit"
            onClick={(event) => {
              if (!confirmAction("Dismiss this report?")) {
                event.preventDefault();
              }
            }}
          >
            Dismiss Report
          </button>
          <button
            className="secondaryButton"
            formAction={issueWarning}
            type="submit"
            onClick={(event) => {
              if (!confirmAction("Issue a private warning to this account?")) {
                event.preventDefault();
              }
            }}
          >
            Issue Warning
          </button>
          <button
            className="dangerButton"
            formAction={suspendUser}
            type="submit"
            onClick={(event) => {
              if (!confirmAction("Suspend this account?")) {
                event.preventDefault();
              }
            }}
          >
            Suspend User
          </button>
          <button
            className="secondaryButton"
            formAction={restoreUser}
            type="submit"
            onClick={(event) => {
              if (!confirmAction("Restore this account?")) {
                event.preventDefault();
              }
            }}
          >
            Restore User
          </button>
        </div>
      </form>
    </section>
  );
}
