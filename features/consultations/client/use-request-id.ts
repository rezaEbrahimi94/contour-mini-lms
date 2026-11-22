"use client";

import { useRef } from "react";
import type { BookingDetails } from "../contracts";

/**
 * Gives each distinct booking one request id. Submitting the same details
 * again, for example after a dropped connection, reuses the id, so the API
 * recognises the retry and does not book twice. Changing any detail starts a
 * new booking with a new id.
 */
export function useRequestId() {
  const last = useRef({ details: "", requestId: "" });

  function requestIdFor(details: BookingDetails) {
    // Compare the same normalized values the API stores after a successful write.
    const signature = JSON.stringify(details);
    if (last.current.details !== signature)
      last.current = { details: signature, requestId: crypto.randomUUID() };
    return last.current.requestId;
  }

  /** Call after a booking is saved, so the next one gets a new id. */
  function forget() {
    last.current = { details: "", requestId: "" };
  }

  return { requestIdFor, forget };
}
