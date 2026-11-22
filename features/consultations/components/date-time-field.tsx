"use client";

import { CalendarDays } from "lucide-react";
import dynamic from "next/dynamic";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { scheduleTimeZoneLabel } from "../policy";
import {
  calendarDayValue,
  clockLabel,
  scheduleCalendarDay,
  scheduleMinutesOfDay,
} from "../schedule-time";
import { TimeInput } from "./time-input";

const DateDialog = dynamic(() => import("./date-dialog"));
const dateLabel = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function DateTimeField({
  currentBooking,
}: {
  currentBooking?: string | undefined;
}) {
  // A saved booking opens on its campus date and time, not the browser's.
  const saved = currentBooking ? new Date(currentBooking) : undefined;
  const [day, setDay] = useState(() =>
    saved ? scheduleCalendarDay(saved) : undefined,
  );
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  return (
    <div className="grid items-start gap-x-3 gap-y-4 min-[420px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] min-[420px]:gap-y-2">
      <div className="grid gap-2">
        <Label asChild>
          <span id={id}>Date</span>
        </Label>
        <input
          type="hidden"
          name="date"
          value={day ? calendarDayValue(day) : ""}
        />
        <Button
          ref={trigger}
          type="button"
          variant="outline"
          className="w-full justify-start border-input bg-transparent font-normal"
          aria-labelledby={id + " " + id + "-date"}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            setOpen(true);
          }}
        >
          <CalendarDays aria-hidden="true" className="text-primary" />
          <span id={id + "-date"}>
            {day ? dateLabel.format(day) : "Choose date"}
          </span>
        </Button>
      </div>
      <TimeInput
        initial={saved ? clockLabel(scheduleMinutesOfDay(saved)) : ""}
      />
      <p className="text-sm text-muted-foreground min-[420px]:col-span-2">
        Times are in {scheduleTimeZoneLabel}.
      </p>
      {open && (
        <DateDialog
          selected={day}
          onChoose={setDay}
          onDismiss={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}
