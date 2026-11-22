"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function PageError({ retry }: { retry: () => void }) {
  return (
    <main
      id="main-content"
      className="mx-auto my-8 w-[min(92%,33rem)] sm:my-16"
    >
      <Card>
        <CardHeader>
          <h1 className="text-3xl">Unable to load this page</h1>
          <p className="text-muted-foreground">Please try again in a moment.</p>
        </CardHeader>
        <CardContent>
          <Button type="button" size="lg" onClick={retry}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
