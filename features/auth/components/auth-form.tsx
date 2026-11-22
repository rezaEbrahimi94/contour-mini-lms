import Link from "next/link";
import { Banner } from "@/components/banner";
import { Notice } from "@/components/notice";
import { PortalHeader } from "@/components/portal-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emailMaxLength,
  passwordMaxLength,
  passwordMinLength,
} from "../credentials";

export type AuthSearch = Promise<{
  error?: string | string[];
  notice?: string | string[];
}>;

// Login and signup are the same form with different words and a different
// address to post to.
const modes = {
  login: {
    title: "Student login",
    description: "Log in to book a consultation or check your schedule.",
    action: "/api/auth/login",
    submitLabel: "Log in",
    failure: "Login failed. Check your email and password and try again.",
    passwordAutoComplete: "current-password",
    otherPage: { href: "/signup", label: "Create a student account" },
  },
  signup: {
    title: "Create your student account",
    description: "Set up your account to book your first consultation.",
    action: "/api/auth/signup",
    submitLabel: "Create account",
    failure:
      "We couldn’t create your account. Check your details and try again.",
    passwordAutoComplete: "new-password",
    otherPage: { href: "/login", label: "Already registered? Log in" },
  },
} as const;

export async function AuthForm({
  mode,
  searchParams,
}: {
  mode: keyof typeof modes;
  searchParams: AuthSearch;
}) {
  const { error, notice } = await searchParams;
  const copy = modes[mode];
  const signup = mode === "signup";
  return (
    <>
      <PortalHeader />
      <main
        id="main-content"
        className="mx-auto my-8 w-[min(92%,33rem)] sm:my-16"
      >
        <Card className="gap-0 py-0">
          <Banner
            className="rounded-none"
            title={copy.title}
            description={copy.description}
          />
          <CardContent className="grid gap-4 p-6 sm:p-8">
            {error && (
              <Notice tone="error">
                {error === "confirm"
                  ? "Your confirmation link could not be verified. Try logging in."
                  : copy.failure}
              </Notice>
            )}
            {notice === "confirm" && (
              <Notice tone="success">
                Check your email and open the confirmation link in this browser.
              </Notice>
            )}
            {/* A plain form post: signing in works before any JavaScript loads. */}
            <form method="post" action={copy.action} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  maxLength={emailMaxLength}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  required
                  minLength={signup ? passwordMinLength : undefined}
                  maxLength={passwordMaxLength}
                  aria-describedby={signup ? "password-hint" : undefined}
                  autoComplete={copy.passwordAutoComplete}
                />
                {signup && (
                  <p
                    id="password-hint"
                    className="text-sm text-muted-foreground"
                  >
                    Use at least {passwordMinLength} characters.
                  </p>
                )}
              </div>
              <Button type="submit" size="lg">
                {copy.submitLabel}
              </Button>
            </form>
            <Button asChild variant="link" className="justify-self-start px-0">
              <Link href={copy.otherPage.href}>{copy.otherPage.label}</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
