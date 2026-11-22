import { signupSchema } from "@/features/auth/credentials";
import {
  authFormPost,
  readCredentials,
  signUpResponse,
} from "@/features/auth/server/auth-form-post";

export function POST(request: Request) {
  return authFormPost(request, async ({ auth, origin }) => {
    const credentials = await readCredentials(request, signupSchema);
    if (credentials === null) return signUpResponse("rejected");
    return signUpResponse(await auth.signUp(credentials, origin));
  });
}
