import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Consultation, ConsultationPage } from "../contracts";
import type { Period } from "../list-query";
import { scheduleTimeZone, scheduleTimeZoneLabel } from "../policy";
import { BookingControls } from "./booking-controls";

/** The student dashboard shows one period at a time. The admin view shows all. */
type View = Period | "admin";

type Props = ConsultationPage & { page: number; view: View };

// Formatting names the schedule time zone, so the server and every browser
// render the same text for the same instant.
const format = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: scheduleTimeZone, ...options });
const dateAndTime = format({ dateStyle: "medium", timeStyle: "short" });
const month = format({ month: "short" });
const day = format({ day: "numeric" });

const periods = [
  { period: "upcoming", label: "Upcoming", href: "/dashboard" },
  { period: "history", label: "History", href: "/dashboard?view=history" },
] as const;

const emptyMessage = {
  upcoming: {
    title: "No upcoming consultations",
    hint: "Your bookings will appear here once you choose a time.",
  },
  history: {
    title: "No past consultations",
    hint: "Past consultations appear here after their scheduled time.",
  },
  admin: {
    title: "No consultations yet",
    hint: "Student bookings will appear here once created.",
  },
} satisfies Record<View, { title: string; hint: string }>;

const emptyPageMessage = {
  title: "No consultations on this page",
  hint: "Go back to the previous page to see earlier results.",
};

function pageHref(view: View, page: number) {
  if (view === "admin") return `/admin?page=${page}`;
  if (view === "history") return `/dashboard?view=history&page=${page}`;
  return `/dashboard?page=${page}`;
}

export function ConsultationList({ items, page, hasNext, view }: Props) {
  return (
    <section aria-labelledby="schedule-title" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="schedule-title" className="text-3xl">
          {view === "admin" ? "All consultations" : "Your consultations"}
        </h2>
        {items.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {scheduleTimeZoneLabel}
          </p>
        )}
      </div>
      {view !== "admin" && <PeriodTabs current={view} />}
      {items.length === 0 && (
        <EmptyList message={page > 1 ? emptyPageMessage : emptyMessage[view]} />
      )}
      {items.map((item) => (
        <ConsultationCard
          key={item.id}
          consultation={item}
          editable={view !== "admin"}
        />
      ))}
      {(page > 1 || hasNext) && (
        <nav
          aria-label="Consultation pages"
          className="flex flex-wrap items-center gap-3 pt-2"
        >
          {page > 1 && (
            <Button asChild variant="outline">
              <Link href={pageHref(view, page - 1)}>Previous page</Link>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">Page {page}</span>
          {hasNext && (
            <Button asChild variant="outline">
              <Link href={pageHref(view, page + 1)}>Next page</Link>
            </Button>
          )}
        </nav>
      )}
    </section>
  );
}

function PeriodTabs({ current }: { current: Period }) {
  return (
    <nav aria-label="Consultation views" className="flex gap-2">
      {periods.map(({ period, label, href }) => (
        <Button
          key={period}
          asChild
          variant={current === period ? "default" : "outline"}
        >
          <Link
            prefetch={false}
            href={href}
            aria-current={current === period ? "page" : undefined}
          >
            {label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}

function EmptyList({ message }: { message: { title: string; hint: string } }) {
  return (
    <Card className="items-center gap-2 bg-muted/50 px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="mb-2 grid size-14 place-items-center rounded-full bg-secondary text-secondary-foreground"
      >
        <CalendarDays className="size-6" />
      </span>
      <h3 className="text-base font-semibold">{message.title}</h3>
      <p className="max-w-[30ch] text-muted-foreground">{message.hint}</p>
    </Card>
  );
}

function ConsultationCard({
  consultation,
  editable,
}: {
  consultation: Consultation;
  editable: boolean;
}) {
  const { first_name, last_name, reason, scheduled_at, completed } =
    consultation;
  const date = new Date(scheduled_at);
  return (
    <article>
      <Card className="overflow-visible">
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div
              aria-hidden="true"
              className="grid min-w-14 justify-items-center rounded-lg bg-secondary px-2 py-1.5 text-secondary-foreground"
            >
              <span className="text-[0.7rem] font-bold tracking-widest uppercase">
                {month.format(date)}
              </span>
              <span className="font-heading text-2xl leading-tight">
                {day.format(date)}
              </span>
            </div>
            <div className="min-w-[min(9rem,100%)] flex-1">
              <h3 className="text-base font-semibold wrap-anywhere">
                {first_name} {last_name}
              </h3>
              <time dateTime={scheduled_at} className="text-muted-foreground">
                {dateAndTime.format(date)}
              </time>
            </div>
            <Badge
              className={
                completed
                  ? "bg-success text-success-foreground"
                  : "bg-warning text-warning-foreground"
              }
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-current"
              />
              {completed ? "Complete" : "Incomplete"}
            </Badge>
          </div>
          <p className="wrap-anywhere whitespace-pre-line">{reason}</p>
          {editable && <BookingControls consultation={consultation} />}
        </CardContent>
      </Card>
    </article>
  );
}
