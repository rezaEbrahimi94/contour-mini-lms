import {
  AuthForm,
  type AuthSearch,
} from "@/features/auth/components/auth-form";

export default function Signup({ searchParams }: { searchParams: AuthSearch }) {
  return <AuthForm mode="signup" searchParams={searchParams} />;
}
