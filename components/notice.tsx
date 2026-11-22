import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * Feedback about the last action. An error interrupts a screen reader
 * (role="alert"); a confirmation waits its turn (role="status").
 */
export function Notice({
  tone,
  children,
  className,
}: {
  tone: "error" | "success";
  children: ReactNode;
  className?: string;
}) {
  if (tone === "error")
    return (
      <Alert
        variant="destructive"
        className={cn("border-destructive/30 bg-destructive/5", className)}
      >
        <AlertDescription className="wrap-anywhere">
          {children}
        </AlertDescription>
      </Alert>
    );
  return (
    <Alert
      role="status"
      className={cn("border-success-foreground/25 bg-success", className)}
    >
      <AlertDescription className="text-success-foreground">
        {children}
      </AlertDescription>
    </Alert>
  );
}
