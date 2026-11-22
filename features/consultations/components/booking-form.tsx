"use client";

import Link from "next/link";
import { useId, useState, type SubmitEvent } from "react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bookConsultation } from "../client/consultation-api";
import { useConsultationMutation } from "../client/use-consultation-mutation";
import { useRequestId } from "../client/use-request-id";
import { bookingDetailsSchema, type BookingDetails } from "../contracts";
import { nameMaxLength, reasonMaxLength } from "../policy";
import { readSchedule } from "../schedule-time";
import { DateTimeField } from "./date-time-field";

/** Checks what the student entered before anything is sent. */
function readBookingForm(
  fields: FormData,
): { details: BookingDetails } | { error: string } {
  const schedule = readSchedule(fields);
  if ("error" in schedule) return schedule;
  const details = bookingDetailsSchema.safeParse({
    first_name: fields.get("first_name"),
    last_name: fields.get("last_name"),
    reason: fields.get("reason"),
    scheduled_at: schedule.instant,
  });
  if (!details.success)
    return {
      error: `Enter both names (up to ${nameMaxLength} characters each) and a reason (up to ${reasonMaxLength} characters).`,
    };
  return { details: details.data };
}

export function BookingForm({
  showUpcomingLink,
}: {
  showUpcomingLink: boolean;
}) {
  const { save, pending, error } = useConsultationMutation();
  const { requestIdFor, forget } = useRequestId();
  const [validation, setValidation] = useState("");
  const [resetCount, setResetCount] = useState(0);
  const [notice, setNotice] = useState("");
  const id = useId();

  function book(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setNotice("");
    const reading = readBookingForm(new FormData(form));
    if ("error" in reading) {
      setValidation(reading.error);
      return;
    }
    setValidation("");
    const { details } = reading;
    const booking = { ...details, request_id: requestIdFor(details) };
    save(
      () => bookConsultation(booking),
      () => {
        form.reset();
        // A new key remounts the date and time field, which clears it.
        setResetCount((count) => count + 1);
        forget();
        setNotice("Consultation booked.");
      },
    );
  }

  return (
    <section aria-labelledby="book">
      <Card className="overflow-visible">
        <CardHeader>
          <h2 id="book" tabIndex={-1} className="scroll-mt-4 text-3xl">
            Book a consultation
          </h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={book} className="grid gap-4">
            <fieldset
              disabled={pending}
              aria-labelledby="book"
              className="grid min-w-0 gap-4"
            >
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-first`}>First name</Label>
                  <Input
                    id={`${id}-first`}
                    name="first_name"
                    autoComplete="given-name"

                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${id}-last`}>Last name</Label>
                  <Input
                    id={`${id}-last`}
                    name="last_name"
                    autoComplete="family-name"

                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-reason`}>Reason for consultation</Label>
                <Textarea
                  id={`${id}-reason`}
                  placeholder="What would you like help with?"
                  name="reason"

                  required
                />
              </div>
              <DateTimeField key={resetCount} />
              <Button type="submit" size="lg">
                {pending ? "Booking…" : "Book consultation"}
              </Button>
            </fieldset>
            {(validation || error) && (
              <Notice tone="error">{validation || error}</Notice>
            )}
            {notice && (
              <Notice tone="success">
                {notice}
                {showUpcomingLink && (
                  <>
                    {" "}
                    <Link className="underline" href="/dashboard">
                      View upcoming consultations
                    </Link>
                  </>
                )}
              </Notice>
            )}
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
