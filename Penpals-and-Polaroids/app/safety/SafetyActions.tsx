"use client";

import { useId, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { blockUser, reportContent } from "./actions";

const categories = [
  { label: "Harassment", value: "harassment" },
  { label: "Inappropriate content", value: "inappropriate_content" },
  { label: "Spam", value: "spam" },
  { label: "Impersonation", value: "impersonation" },
  { label: "Privacy concern", value: "privacy_concern" },
  { label: "Underage safety", value: "underage_safety" },
  { label: "Other", value: "other" },
];

export function SafetyActions({
  className,
  letterId,
  reportedUserId,
  scrapbookId,
  userName,
}: {
  className?: string;
  letterId?: string;
  reportedUserId: string;
  scrapbookId?: string;
  userName: string;
}) {
  const blockDialog = useRef<HTMLDialogElement>(null);
  const reportDialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const categoryId = useId();
  const descriptionId = useId();
  const queryString = searchParams.toString();
  const returnTo = queryString ? `${pathname}?${queryString}` : pathname;

  return (
    <div className={className ?? "safetyActions"}>
      <button
        className="textAction dangerAction"
        type="button"
        onClick={() => blockDialog.current?.showModal()}
      >
        Block User
      </button>
      <button
        className="textAction"
        type="button"
        onClick={() => reportDialog.current?.showModal()}
      >
        Report
      </button>

      <dialog className="safetyDialog" ref={blockDialog}>
        <form className="safetyDialogForm" action={blockUser}>
          <input name="blockedUserId" type="hidden" value={reportedUserId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <h2>Block {userName}?</h2>
          <p>
            Blocking someone removes them from your Discover page and prevents
            either of you from sending new letters or viewing each other's
            Scrapbooks.
          </p>
          <div className="dialogActions">
            <button className="dangerButton" type="submit">
              Block User
            </button>
            <button
              className="secondaryButton"
              type="button"
              onClick={() => blockDialog.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>

      <dialog className="safetyDialog" ref={reportDialog}>
        <form className="safetyDialogForm" action={reportContent}>
          <input name="reportedUserId" type="hidden" value={reportedUserId} />
          <input name="letterId" type="hidden" value={letterId ?? ""} />
          <input name="scrapbookId" type="hidden" value={scrapbookId ?? ""} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <h2>Report {userName}</h2>

          <label htmlFor={categoryId}>
            Category
            <select id={categoryId} name="category" required>
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor={descriptionId}>
            Optional description
            <textarea
              id={descriptionId}
              maxLength={1200}
              name="description"
              placeholder="Add any context that would help review this report."
            />
          </label>

          <label className="checkboxLine">
            <input name="alsoBlock" type="checkbox" />
            Also block this user
          </label>

          <div className="dialogActions">
            <button className="button" type="submit">
              Submit Report
            </button>
            <button
              className="secondaryButton"
              type="button"
              onClick={() => reportDialog.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
