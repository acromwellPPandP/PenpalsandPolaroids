"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Recipient = {
  id: string;
  label: string;
};

const MIN_LETTER_WORDS = 150;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function countWords(value: string) {
  return value.match(WORD_PATTERN)?.length ?? 0;
}

export function LetterComposer({
  profilesError,
  recipients,
  replyStatus,
  sendLetterAction,
  selectedRecipientId,
  statusMessage,
}: {
  profilesError?: string;
  recipients: Recipient[];
  replyStatus?: string;
  sendLetterAction: (formData: FormData) => Promise<void>;
  selectedRecipientId?: string;
  statusMessage?: string;
}) {
  const [imageName, setImageName] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [status, setStatus] = useState("");
  const [wordCount, setWordCount] = useState(0);

  const canSend = useMemo(
    () =>
      recipients.length > 0 &&
      wordCount >= MIN_LETTER_WORDS &&
      Boolean(imageName),
    [imageName, recipients.length, wordCount],
  );
  const fallbackCounterScript = `
    (() => {
      const minimumWords = ${MIN_LETTER_WORDS};
      const form = document.querySelector('[data-letter-composer="true"]');
      if (!form) return;

      const textarea = form.querySelector('#letter');
      const photoInput = form.querySelector('#photo');
      const counter = form.querySelector('#letter-word-counter');
      const readiness = form.querySelector('#composer-readiness');
      const submitButton = form.querySelector('#post-letter-button');

      function countWords(value) {
        const words = value.match(/[\\p{L}\\p{N}]+(?:['’-][\\p{L}\\p{N}]+)*/gu);
        return words ? words.length : 0;
      }

      function refreshComposerState() {
        const words = countWords(textarea?.value || '');
        const hasPhoto = Boolean(photoInput?.files?.length);
        const ready = words >= minimumWords;
        const canSend = ready && hasPhoto && !submitButton?.dataset.noRecipients;

        if (counter) {
          counter.textContent = words + '/' + minimumWords + ' words minimum';
          counter.dataset.ready = String(ready);
        }

        if (readiness) {
          readiness.dataset.ready = String(canSend);
          readiness.lastChild.textContent = canSend
            ? 'Your letter and Polaroid are ready.'
            : 'Write ' + Math.max(minimumWords - words, 0) + ' more words and add one Polaroid.';
        }

        if (submitButton) {
          submitButton.disabled = !canSend;
        }
      }

      textarea?.addEventListener('input', refreshComposerState);
      textarea?.addEventListener('keyup', refreshComposerState);
      textarea?.addEventListener('paste', () => setTimeout(refreshComposerState, 0));
      photoInput?.addEventListener('change', refreshComposerState);
      refreshComposerState();
    })();
  `;

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  function updateLetter(value: string) {
    setWordCount(countWords(value));
    setStatus("");
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setStatus("");

    if (!file) {
      setImageName("");
      setImagePreview("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      setImageName("");
      setImagePreview("");
      setStatus("Choose one image file before sending.");
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageName(file.name);
    setImagePreview(URL.createObjectURL(file));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const formLetter = form.elements.namedItem("letter");
    const formPhoto = form.elements.namedItem("photo");
    const currentWordCount =
      formLetter instanceof HTMLTextAreaElement ? countWords(formLetter.value) : 0;
    const hasPhoto =
      formPhoto instanceof HTMLInputElement && Boolean(formPhoto.files?.length);

    if (
      recipients.length === 0 ||
      currentWordCount < MIN_LETTER_WORDS ||
      !hasPhoto
    ) {
      event.preventDefault();
      setWordCount(currentWordCount);
      setStatus(
        currentWordCount < MIN_LETTER_WORDS
          ? `Write at least ${MIN_LETTER_WORDS} words before sending.`
          : "Attach exactly one image before sending.",
      );
      return;
    }

    if (!window.confirm("Ready to post your letter and Polaroid?")) {
      event.preventDefault();
    }
  }

  return (
    <form
      className="composerForm stationeryComposer"
      action={sendLetterAction}
      data-letter-composer="true"
      onSubmit={handleSubmit}
    >
      <div className="stationeryHeader">
        <label htmlFor="recipient">To</label>
        <select
          id="recipient"
          name="recipient"
          defaultValue={selectedRecipientId}
          disabled={recipients.length === 0}
        >
          {recipients.length > 0 ? (
            recipients.map((recipient) => (
              <option key={recipient.id} value={recipient.id}>
                {recipient.label}
              </option>
            ))
          ) : (
            <option>No pen pals found yet</option>
          )}
        </select>
      </div>
      {profilesError ? (
        <p className="formMessage">{profilesError}</p>
      ) : recipients.length === 0 ? (
        <p className="formMessage">
          No pen pals found yet. Real profiles from Supabase will appear here.
        </p>
      ) : null}
      {replyStatus ? <p className="replyMessage">{replyStatus}</p> : null}
      <p className="replyMessage">
        Your letter will begin its journey after you post it. It will remain
        sealed until it reaches your pen pal. Estimated journey: approximately
        5-12 days for most international routes.
      </p>

      <section className="letterStationery" aria-labelledby="letter-label">
        <div className="letterStationeryTop">
          <label id="letter-label" htmlFor="letter">
            Letter
          </label>
          <p
            className="characterCounter"
            data-ready={wordCount >= MIN_LETTER_WORDS}
            id="letter-word-counter"
          >
            {wordCount}/{MIN_LETTER_WORDS} words minimum
          </p>
        </div>
        <textarea
          id="letter"
          name="letter"
          placeholder="Dear pen pal,"
          onChange={(event) => updateLetter(event.currentTarget.value)}
          onInput={(event) => updateLetter(event.currentTarget.value)}
          required
        />
      </section>

      <section className="polaroidUploadSection" aria-labelledby="photo-label">
        <div>
          <label id="photo-label" htmlFor="photo">
            Polaroid
          </label>
          <p className="polaroidNote">
            Every letter in Penpals & Polaroids includes one photograph to share
            a moment from your world.
          </p>
        </div>

        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          required
        />

        <div className="imageRequirement" data-ready={Boolean(imageName)}>
          <span aria-hidden="true" />
          {imageName
            ? `Selected Polaroid: ${imageName}`
            : "Select exactly one image to unlock Send."}
        </div>

        {imagePreview ? (
          <figure className="polaroidPreview">
            <img src={imagePreview} alt="Selected Polaroid preview" />
            <figcaption>{imageName}</figcaption>
          </figure>
        ) : (
          <div className="emptyPreview polaroidPlaceholder">No Polaroid selected</div>
        )}
      </section>

      <div className="composerReadiness" data-ready={canSend} id="composer-readiness">
        <span aria-hidden="true" />
        {canSend
          ? "Your letter and Polaroid are ready."
          : `Write ${Math.max(MIN_LETTER_WORDS - wordCount, 0)} more words and add one Polaroid.`}
      </div>

      {status ? <p className="formMessage">{status}</p> : null}
      {statusMessage ? <p className="formMessage">{statusMessage}</p> : null}

      <button
        className="button composerButton"
        data-no-recipients={recipients.length === 0 ? "true" : undefined}
        disabled={!canSend}
        id="post-letter-button"
        type="submit"
      >
        Post Letter
      </button>
      <script dangerouslySetInnerHTML={{ __html: fallbackCounterScript }} />
    </form>
  );
}
