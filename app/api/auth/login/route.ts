import { loginSchema } from "@/features/auth/credentials";
import {
  authFormPost,
  logInResponse,
  readCredentials,
} from "@/features/auth/server/auth-form-post";

export function POST(request: Request) {
  return authFormPost(request, async ({ auth }) => {
    const credentials = await readCredentials(request, loginSchema);
    const signedIn = credentials !== null && (await auth.logIn(credentials));
    return logInResponse(signedIn);
  });
}
