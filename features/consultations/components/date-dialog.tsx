"use client";
import { DayPicker } from "@daypicker/react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useRef, useState, useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { scheduleCalendarDay } from "../schedule-time";
// Each day's spoken name starts from the number a sighted user sees, so voice
// control ("click 24") and screen readers agree with the screen.
const dayName = new Intl.DateTimeFormat("en-AU", { dateStyle: "full" });
const shortcuts = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In a week", days: 7 },
];

export default function DateDialog({
  selected,
  onChoose,
  onDismiss,
}: {
  selected: Date | undefined;
  onChoose: (day: Date) => void;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  // "Today" is the campus date, which can differ from the browser's.
  const [today] = useState(() => scheduleCalendarDay(new Date()));
  const [month, setMonth] = useState(
    selected && selected >= today ? selected : today,
  );
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  function dismiss() {
    dialog.current?.close();
    onDismiss();
  }
  function chooseDay(day: Date) {
    onChoose(day);
    dismiss();
  }
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={title}
      className="m-auto max-h-[calc(100dvh-1.25rem)] w-[min(27rem,calc(100%-1.25rem))] overflow-y-auto overscroll-contain rounded-xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-foreground/60"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
    >
      <header className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <h2 id={title} className="text-2xl">
          Choose a date
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="Close calendar"
          onClick={dismiss}
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <div className="grid gap-4 px-5 py-4">
        <div
          role="group"
          aria-label="Date shortcuts"
          className="flex flex-wrap gap-2"
        >
          {shortcuts.map(({ label, days }) => {
            const date = new Date(today);
            date.setDate(date.getDate() + days);
            const pressed = selected?.toDateString() === date.toDateString();
            return (
              <Button
                type="button"
                key={label}
                variant={pressed ? "default" : "outline"}
                className="rounded-full"
                aria-pressed={pressed}
                onClick={() => {
                  chooseDay(date);
                }}
              >
                {label}
              </Button>
            );
          })}
        </div>
        <DayPicker
          mode="single"
          required
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          onSelect={chooseDay}
          weekStartsOn={1}
          startMonth={today}
          disabled={{ before: today }}
          labels={{
            labelDayButton: (date, { today: isToday, selected: isSelected }) =>
              `${isToday ? "Today, " : ""}${dayName.format(date)}${isSelected ? ", selected" : ""}`,
          }}
        />
      </div>
    </dialog>,
    document.body,
  );
}
