"use client";

import { ChevronRight } from "lucide-react";
import { useRef, useState, type SubmitEvent } from "react";
import { Notice } from "@/components/notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  cancelConsultation,
  changeConsultation,
  type SaveResult,
} from "../client/consultation-api";
import { useConsultationMutation } from "../client/use-consultation-mutation";
import type { BookingVersion, Consultation, Revision } from "../contracts";
import { readSchedule } from "../schedule-time";
import { DateTimeField } from "./date-time-field";

export function BookingControls({
  consultation,
}: {
  consultation: Consultation;
}) {
  const { id, version: revision, completed, scheduled_at } = consultation;
  const { save, reload, error, pending, outOfDate } = useConsultationMutation();
  // An open editor or confirmation keeps the revision the student was looking
  // at when they opened it, even if the list refreshes underneath.
  const [rescheduleRevision, setRescheduleRevision] = useState<Revision | null>(
    null,
  );
  const [cancelRevision, setCancelRevision] = useState<Revision | null>(null);
  const [timeError, setTimeError] = useState("");
  const [notice, setNotice] = useState("");
  const reschedulePanel = useRef<HTMLDetailsElement>(null);

  // When this card's own save moves the booking to a new revision, nothing
  // else changed in between, so controls still open on the old revision
  // follow it. A change made anywhere else still conflicts.
  function saveAt(
    from: Revision,
    send: (booking: BookingVersion) => Promise<SaveResult>,
    afterSave?: () => void,
  ) {
    save(
      () => send({ id, revision: from }),
      (saved) => {
        const follow = (open: Revision | null) =>
          saved !== null && open === from ? saved : open;
        setRescheduleRevision(follow);
        setCancelRevision(follow);
        afterSave?.();
      },
    );
  }

  function toggleCompleted() {
    saveAt(revision, (booking) =>
      changeConsultation(booking, { completed: !completed }),
    );
  }

  function reschedule(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rescheduleRevision) return;
    setNotice("");
    const schedule = readSchedule(new FormData(event.currentTarget));
    if ("error" in schedule) {
      setTimeError(schedule.error);
      return;
    }
    setTimeError("");
    saveAt(
      rescheduleRevision,
      (booking) =>
        changeConsultation(booking, { scheduled_at: schedule.instant }),
      () => {
        closeReschedulePanel();
        setNotice("Consultation rescheduled.");
      },
    );
  }

  /** Closes the editor and returns focus to the button that opened it. */
  function closeReschedulePanel() {
    const panel = reschedulePanel.current;
    if (!panel) return;
    panel.open = false;
    panel.querySelector("summary")?.focus();
  }

  function cancel() {
    if (cancelRevision) saveAt(cancelRevision, cancelConsultation);
  }

  function reloadLatest() {
    setRescheduleRevision(null);
    setCancelRevision(null);
    setNotice("");
    setTimeError("");
    reload();
  }

  if (outOfDate) return <OutOfDate message={error} onReload={reloadLatest} />;

  const failure = error || timeError;
  return (
    <fieldset
      disabled={pending}
      aria-label="Manage consultation"
      className="flex min-w-0 flex-wrap items-start gap-2 border-t pt-4"
    >
      <Button type="button" variant="outline" onClick={toggleCompleted}>
        {completed ? "Mark incomplete" : "Mark complete"}
      </Button>
      <details
        ref={reschedulePanel}
        className="group open:w-full"
        onToggle={(event) => {
          setRescheduleRevision(event.currentTarget.open ? revision : null);
          if (event.currentTarget.open) setNotice("");
        }}
      >
        <summary
          data-slot="button"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
          )}
        >
          <ChevronRight aria-hidden="true" className="group-open:rotate-90" />
          Reschedule
        </summary>
        {rescheduleRevision && (
          <form
            onSubmit={reschedule}
            className="mt-2 grid gap-4 rounded-lg bg-muted p-4"
          >
            <DateTimeField currentBooking={scheduled_at} />
            <Button type="submit" className="justify-self-start">
              Save new time
            </Button>
          </form>
        )}
      </details>
      {cancelRevision ? (
        <CancelConfirmation
          onConfirm={cancel}
          onKeep={() => {
            setCancelRevision(null);
          }}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setCancelRevision(revision);
          }}
        >
          Cancel consultation
        </Button>
      )}
      {notice && !failure && (
        <Notice tone="success" className="w-full">
          {notice}
        </Notice>
      )}
      {failure && (
        <Notice tone="error" className="w-full">
          {failure}
        </Notice>
      )}
    </fieldset>
  );
}

function CancelConfirmation({
  onConfirm,
  onKeep,
}: {
  onConfirm: () => void;
  onKeep: () => void;
}) {
  return (
    <div className="grid w-full gap-3 rounded-lg bg-muted p-4">
      <p>Cancel this consultation?</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" onClick={onConfirm}>
          Confirm cancellation
        </Button>
        <Button type="button" variant="outline" onClick={onKeep}>
          Keep booking
        </Button>
      </div>
    </div>
  );
}

/** Shown when the booking was changed or cancelled somewhere else. */
function OutOfDate({
  message,
  onReload,
}: {
  message: string;
  onReload: () => void;
}) {
  return (
    <div className="grid justify-items-start gap-3 border-t pt-4">
      <Notice tone="error">{message}</Notice>
      <Button type="button" variant="outline" onClick={onReload}>
        Reload latest bookings
      </Button>
    </div>
  );
}
