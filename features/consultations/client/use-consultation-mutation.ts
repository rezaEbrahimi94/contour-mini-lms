"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Revision } from "../contracts";
import type { SaveResult } from "./consultation-api";

type Failure = { status: number; message: string };

/**
 * Runs one save for a form or a booking card: tracks whether it is pending,
 * keeps the failure to show, and refreshes the server-rendered list after.
 */
export function useConsultationMutation() {
  const router = useRouter();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();

  function save(
    send: () => Promise<SaveResult>,
    afterSave?: (revision: Revision | null) => void,
  ) {
    setFailure(null);
    startTransition(async () => {
      const result = await send();
      if (!result.ok) {
        setFailure(result);
        return;
      }
      afterSave?.(result.revision);
      startTransition(() => {
        router.refresh();
      });
    });
  }

  function reload() {
    startTransition(() => {
      setFailure(null);
      router.refresh();
    });
  }

  return {
    save,
    reload,
    pending,
    error: failure?.message ?? "",
    // The booking was changed or cancelled elsewhere, so what this browser
    // shows is out of date and only a reload can help.
    outOfDate: failure?.status === 412 || failure?.status === 404,
  };
}
