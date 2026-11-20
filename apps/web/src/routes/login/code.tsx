import { useMutation } from "@tanstack/react-query";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { useForm } from "react-hook-form";
import { authClient } from "../../auth-client.ts";
import { AuthCard } from "./-components/auth-card";

export const Route = createFileRoute("/login/code")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : "",
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (!search.email) throw redirect({ to: "/login" });
  },
  component: CodePage,
});

const codeFormSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    code: Schema.String.check(Schema.isMinLength(6, { message: "The code is 6 digits." }), Schema.isMaxLength(6, { message: "The code is 6 digits." })),
  }),
);
type CodeValues = typeof codeFormSchema.Type;

function CodePage() {
  const { email, redirect: redirectTo } = Route.useSearch();

  // Capture stages: a six-digit local part IS the code, so the field
  // prefills with no backend call. In production the code arrives by email.
  const chosen = /^(\d{6})@/.exec(email)?.[1];
  const autofilled = Boolean(chosen);

  const codeForm = useForm<CodeValues>({
    resolver: standardSchemaResolver(codeFormSchema),
    defaultValues: { code: chosen ?? "" },
  });

  const verifyCode = useMutation({
    mutationFn: async (values: CodeValues) => {
      const result = await authClient.signIn.emailOtp({ email, otp: values.code });
      if (result.error) throw new Error(result.error.message || "We could not verify that code.");
    },
    onSuccess: () => {
      window.location.href = redirectTo || "/";
    },
  });

  return (
    <AuthCard title="Enter your code" description={`We sent a 6-digit code to ${email}.`}>
      <form onSubmit={codeForm.handleSubmit((values) => verifyCode.mutate(values))} className="flex flex-col gap-3">
        <div className="field">
          <label className="field-label" htmlFor="otp">
            Code
          </label>
          <input
            id="otp"
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            {...codeForm.register("code")}
            aria-invalid={Boolean(codeForm.formState.errors.code)}
          />
          {codeForm.formState.errors.code ? (
            <p className="field-error" role="alert">
              {codeForm.formState.errors.code.message}
            </p>
          ) : null}
          {autofilled ? <p className="field-help">Dev shortcut: the code is the six digits in the address. No email was sent.</p> : null}
        </div>
        <button type="submit" disabled={verifyCode.isPending} className="btn btn-primary w-full">
          {verifyCode.isPending ? "Verifying" : "Verify and continue"}
        </button>
        {verifyCode.isError ? (
          <p className="field-error" role="alert">
            {verifyCode.error instanceof Error ? verifyCode.error.message : "We could not verify that code. Please try again."}
          </p>
        ) : null}
      </form>
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        Wrong address?{" "}
        <Link to="/login" search={{ email, redirect: redirectTo }} className="underline">
          Change email
        </Link>
      </p>
    </AuthCard>
  );
}
