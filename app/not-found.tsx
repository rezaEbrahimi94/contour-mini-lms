import Link from "next/link";
import { PortalHeader } from "@/components/portal-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function NotFound() {
  return (
    <>
      <PortalHeader />
      <main
        id="main-content"
        className="mx-auto my-8 w-[min(92%,33rem)] sm:my-16"
      >
        <Card>
          <CardHeader>
            <h1 className="text-3xl">Page unavailable</h1>
            <p className="text-muted-foreground">
              Return to your dashboard to see the consultations you can access.
            </p>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
