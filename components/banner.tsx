import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The wine block that opens each screen: its only h1, a line of context, and an optional action. */
export function Banner({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative isolate overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground sm:p-10 [&_:focus-visible]:outline-primary-foreground",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-1/4 contour-lines opacity-50 sm:w-2/5 sm:opacity-100"
      />
      <h1 className="text-4xl sm:text-5xl">{title}</h1>
      <p className="mt-3 max-w-[85%] text-primary-foreground/85 sm:max-w-[66%]">
        {description}
      </p>
      {children}
    </header>
  );
}
