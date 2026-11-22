/** Ends a switch over a union. An unhandled member stops this compiling. */
export function unreachable(value: never): never {
  throw new Error("Unhandled case: " + JSON.stringify(value));
}
