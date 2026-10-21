import Link from "next/link";
import { redirect } from "next/navigation";
import { signUp } from "../auth/actions";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { createClient } from "../../utils/supabase/server";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const isConfigured = isSupabaseConfigured();
  const supabase = isConfigured ? await createClient() : null;
  const {
    data: { user },
  } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null } };
  const { message } = await searchParams;

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="authPage">
      <section className="authPanel" aria-labelledby="signup-title">
        <Link className="brand authBrand" href="/">
          <img className="brandMark" src="/penpals-polaroids-logo.png" alt="" />
          Penpals & Polaroids
        </Link>
        <p className="eyebrow">Start slowly</p>
        <h1 id="signup-title">Create your penpal account.</h1>
        <form className="authForm" action={signUp}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />

          {!isConfigured ? (
            <p className="formMessage">
              Add your Supabase project URL and anon key to .env.local to enable
              account creation.
            </p>
          ) : null}
          {message ? <p className="formMessage">{message}</p> : null}

          <button className="button authButton" type="submit">
            Create Account
          </button>
        </form>
        <p className="authSwitch">
          Already joined? <Link href="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
