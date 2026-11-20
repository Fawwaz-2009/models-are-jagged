import { useMutation } from "@tanstack/react-query";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { useForm } from "react-hook-form";
import { authClient } from "../../auth-client.ts";
import { AuthCard } from "./-components/auth-card";

export const Route = createFileRoute("/login/")({
  validateSearch: (search: Record<string, unknown>): { email?: string; redirect?: string } => ({
    email: typeof search.email === "string" ? search.email : undefined,
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: Login,
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailFormSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    email: Schema.String.check(Schema.makeFilter((value) => EMAIL_PATTERN.test(value), { message: "Enter a valid email address.", identifier: "LoginEmail" })),
  }),
);
type EmailValues = typeof emailFormSchema.Type;

function Login() {
  const { email: returningEmail, redirect } = Route.useSearch();
  const navigate = useNavigate();

  const emailForm = useForm<EmailValues>({
    resolver: standardSchemaResolver(emailFormSchema),
    defaultValues: { email: returningEmail ?? "" },
  });

  const sendCode = useMutation({
    mutationFn: async (values: EmailValues) => {
      const normalized = values.email.trim().toLowerCase();
      const result = await authClient.emailOtp.sendVerificationOtp({ email: normalized, type: "sign-in" });
      if (result.error) throw new Error(result.error.message || "We could not send a sign-in code.");
      return normalized;
    },
    onSuccess: (normalized) => {
      navigate({ to: "/login/code", search: { email: normalized, redirect } });
    },
  });

  return (
    <AuthCard title="Sign in to publish" description="Passwordless. The first sign-in with any email creates the account.">
      <form onSubmit={emailForm.handleSubmit((values) => sendCode.mutate(values))} className="flex flex-col gap-3">
        <div className="field">
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...emailForm.register("email")}
            aria-invalid={Boolean(emailForm.formState.errors.email)}
          />
          {emailForm.formState.errors.email ? (
            <p className="field-error" role="alert">
              {emailForm.formState.errors.email.message}
            </p>
          ) : null}
        </div>
        <button type="submit" disabled={sendCode.isPending} className="btn btn-primary w-full">
          {sendCode.isPending ? "Sending" : "Send a code"}
        </button>
        {sendCode.isError ? (
          <p className="field-error" role="alert">
            {sendCode.error instanceof Error ? sendCode.error.message : "We could not send a sign-in code. Please try again."}
          </p>
        ) : null}
      </form>
    </AuthCard>
  );
}
