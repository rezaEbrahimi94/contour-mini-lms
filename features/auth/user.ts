import { z } from "zod";

// A user id, a consultation id and a booking revision are all UUID strings.
// Giving each its own type means passing one where another is expected is a
// compile error. A value only gets the type by passing its schema.
export const userIdSchema = z.uuid().brand<"UserId">();
export type UserId = z.infer<typeof userIdSchema>;

/** The signed-in person, as pages need to show them. */
export type User = { readonly id: UserId; readonly email: string | undefined };
