"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import {
  permanentlyRemoveLetterFromMyAccount,
  removeLetterFromMyView,
  restoreLetterToMyView,
  withdrawLetter,
} from "./actions";

function returnTo(pathname: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}

export function LetterRemovalControls({
  canPermanentlyRemove = false,
  canRemove = true,
  canRestore = false,
  canWithdraw = false,
  letterId,
}: {
  canPermanentlyRemove?: boolean;
  canRemove?: boolean;
  canRestore?: boolean;
  canWithdraw?: boolean;
  letterId: string;
}) {
  const removeDialog = useRef<HTMLDialogElement>(null);
  const restoreDialog = useRef<HTMLDialogElement>(null);
  const permanentDialog = useRef<HTMLDialogElement>(null);
  const withdrawDialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentReturnTo = returnTo(pathname, searchParams);

  return (
    <div className="letterRemovalControls">
      {canRemove ? (
        <button
          className="textAction"
          type="button"
          onClick={() => removeDialog.current?.showModal()}
        >
          Remove from my view
        </button>
      ) : null}
      {canWithdraw ? (
        <button
          className="textAction dangerAction"
          type="button"
          onClick={() => withdrawDialog.current?.showModal()}
        >
          Withdraw Letter
        </button>
      ) : null}
      {canRestore ? (
        <button
          className="textAction"
          type="button"
          onClick={() => restoreDialog.current?.showModal()}
        >
          Restore letter
        </button>
      ) : null}
      {canPermanentlyRemove ? (
        <button
          className="textAction dangerAction"
          type="button"
          onClick={() => permanentDialog.current?.showModal()}
        >
          Permanently remove from my account view
        </button>
      ) : null}

      <dialog className="safetyDialog" ref={removeDialog}>
        <form className="safetyDialogForm" action={removeLetterFromMyView}>
          <input name="letterId" type="hidden" value={letterId} />
          <input name="returnTo" type="hidden" value={currentReturnTo} />
          <h2>Remove this letter?</h2>
          <p>
            This will hide the letter from your account. It will remain visible
            to your pen pal unless they remove it separately.
          </p>
          <div className="dialogActions">
            <button className="secondaryButton" type="button" onClick={() => removeDialog.current?.close()}>
              Cancel
            </button>
            <button className="dangerButton" type="submit">
              Remove from my view
            </button>
          </div>
        </form>
      </dialog>

      <dialog className="safetyDialog" ref={withdrawDialog}>
        <form className="safetyDialogForm" action={withdrawLetter}>
          <input name="letterId" type="hidden" value={letterId} />
          <input name="returnTo" type="hidden" value={currentReturnTo} />
          <h2>Withdraw this letter?</h2>
          <p>
            This letter is still travelling. Withdrawing it will prevent your
            pen pal from receiving or opening it. This cannot be undone.
          </p>
          <label>
            Optional note for your records
            <textarea
              maxLength={500}
              name="reason"
              placeholder="This is private and is not shown to your pen pal."
            />
          </label>
          <div className="dialogActions">
            <button className="secondaryButton" type="button" onClick={() => withdrawDialog.current?.close()}>
              Keep Letter Travelling
            </button>
            <button className="dangerButton" type="submit">
              Withdraw Letter
            </button>
          </div>
        </form>
      </dialog>

      <dialog className="safetyDialog" ref={restoreDialog}>
        <form className="safetyDialogForm" action={restoreLetterToMyView}>
          <input name="letterId" type="hidden" value={letterId} />
          <input name="returnTo" type="hidden" value={currentReturnTo} />
          <h2>Restore this letter to your Scrapbook?</h2>
          <p>
            Restoring only affects your account view. It will not notify your
            pen pal or change the original journey.
          </p>
          <div className="dialogActions">
            <button className="secondaryButton" type="button" onClick={() => restoreDialog.current?.close()}>
              Cancel
            </button>
            <button className="button" type="submit">
              Restore letter
            </button>
          </div>
        </form>
      </dialog>

      <dialog className="safetyDialog" ref={permanentDialog}>
        <form className="safetyDialogForm" action={permanentlyRemoveLetterFromMyAccount}>
          <input name="letterId" type="hidden" value={letterId} />
          <input name="returnTo" type="hidden" value={currentReturnTo} />
          <h2>Permanently remove this from your account view?</h2>
          <p>
            This permanently removes the letter from your account view. It will
            not remove your pen pal's copy.
          </p>
          <div className="dialogActions">
            <button className="secondaryButton" type="button" onClick={() => permanentDialog.current?.close()}>
              Cancel
            </button>
            <button className="dangerButton" type="submit">
              Permanently remove from my account view
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
