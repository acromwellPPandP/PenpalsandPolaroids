import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "../auth/actions";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { createClient } from "../../utils/supabase/server";

export default async function LoginPage({
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
      <section className="authPanel" aria-labelledby="login-title">
        <Link className="brand authBrand" href="/">
          <img className="brandMark" src="/penpals-polaroids-logo.png" alt="" />
          Penpals & Polaroids
        </Link>
        <p className="eyebrow">Welcome back</p>
        <h1 id="login-title">Sign in to continue your exchange.</h1>
        <form className="authForm" action={signIn}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={6}
            required
          />

          {!isConfigured ? (
            <p className="formMessage">
              Add your Supabase project URL and anon key to .env.local to enable
              sign in.
            </p>
          ) : null}
          {message ? <p className="formMessage">{message}</p> : null}

          <button className="button authButton" type="submit">
            Sign In
          </button>
        </form>
        <p className="authSwitch">
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
