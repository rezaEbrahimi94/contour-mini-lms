import {
  AuthForm,
  type AuthSearch,
} from "@/features/auth/components/auth-form";

export default function Login({ searchParams }: { searchParams: AuthSearch }) {
  return <AuthForm mode="login" searchParams={searchParams} />;
}
