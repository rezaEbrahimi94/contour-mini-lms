import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PortalHeader({
  email,
  admin,
  view = "student",
}: {
  email?: string | undefined;
  admin?: boolean;
  view?: "student" | "admin";
}) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex min-h-16 w-[min(92%,76rem)] flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-card px-4 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50"
        >
          Skip to content
        </a>
        <Link
          href={email ? "/dashboard" : "/login"}
          aria-label="Contour Education home"
          className="flex items-center gap-2.5 font-heading text-2xl font-bold tracking-tight text-primary"
        >
          <span aria-hidden="true" className="relative inline-block h-8 w-7">
            {["bottom-0", "bottom-1", "bottom-2"].map((offset) => (
              <span
                key={offset}
                className={`absolute left-0 h-5 w-full -skew-y-[15deg] rounded-[70%_5%_65%_5%] border-2 border-current ${offset}`}
              />
            ))}
          </span>
          <span>
            Contour <span className="font-normal">Education</span>
          </span>
        </Link>
        {email && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 max-sm:w-full max-sm:justify-between">
            {admin && (
              <Button asChild variant="link" className="px-0">
                <Link href={view === "admin" ? "/dashboard" : "/admin"}>
                  {view === "admin" ? "Student dashboard" : "Admin view"}
                </Link>
              </Button>
            )}
            <span className="min-w-0 text-sm wrap-anywhere text-muted-foreground max-sm:flex-1">
              {email}
            </span>
            <form method="post" action="/api/auth/logout">
              <Button type="submit" variant="outline">
                Log out
              </Button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
