import { z } from "zod";

// One home for the sign-in limits. The form attributes and the Route Handlers
// both read them here. Supabase Auth owns the real password policy; these
// bounds only keep obviously unusable input from reaching it.
export const emailMaxLength = 254;
export const passwordMinLength = 8;
export const passwordMaxLength = 1024;

const email = z.string().trim().min(1).max(emailMaxLength);
const password = z.string().min(1).max(passwordMaxLength);

export const loginSchema = z.object({ email, password });
export const signupSchema = z.object({
  email,
  password: password.min(passwordMinLength),
});
export type Credentials = z.infer<typeof loginSchema>;
