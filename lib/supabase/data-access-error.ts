/**
 * Thrown by a repository when Supabase could not answer, or answered with
 * something unexpected. Expected refusals (not found, changed since read,
 * duplicate request) are returned as values instead.
 */
export class DataAccessError extends Error {
  readonly code: string;
  readonly upstreamStatus: number | undefined;

  constructor(code: string, upstreamStatus?: number) {
    super("Data access failed: " + code);
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }

  /** True when the service was unreachable, so the caller can retry later. */
  get unavailable() {
    const status = this.upstreamStatus;
    if (status === undefined) return false;
    // 0 is a request that never got a response, such as a timeout.
    return [0, 502, 503, 504].includes(status) || (status >= 500 && !this.code);
  }
}
