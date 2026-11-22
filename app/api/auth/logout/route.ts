import {
  authFormPost,
  logOutResponse,
} from "@/features/auth/server/auth-form-post";

export function POST(request: Request) {
  return authFormPost(request, async ({ auth }) =>
    logOutResponse(await auth.logOut()),
  );
}
