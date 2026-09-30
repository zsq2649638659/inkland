import { LoginForm } from "@/components/LoginForm";

type LoginSearchParams = Promise<{ mode?: string | string[] }>;

export default async function LoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  const requestedMode = (await searchParams).mode;
  const mode = Array.isArray(requestedMode) ? requestedMode[0] : requestedMode;
  const initialMode = mode === "reset-password" || mode === "forgot-password" ? mode : "login";

  return <LoginForm initialMode={initialMode} />;
}
