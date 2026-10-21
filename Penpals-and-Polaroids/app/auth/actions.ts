"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authMessage } from "../../utils/supabase/auth-errors";
import { isSupabaseConfigured } from "../../utils/supabase/config";
import { createClient } from "../../utils/supabase/server";

function encodedMessage(message: string) {
  return encodeURIComponent(message);
}

export async function signIn(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(
      `/login?message=${encodedMessage("Add your Supabase URL and anon key to .env.local before signing in.")}`,
    );
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?message=${encodedMessage(authMessage(error))}`);
  }

  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect(
      `/signup?message=${encodedMessage("Add your Supabase URL and anon key to .env.local before creating accounts.")}`,
    );
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/signup?message=${encodedMessage(authMessage(error))}`);
  }

  if (data.session) {
    redirect("/dashboard");
  }

  redirect(
    `/login?message=${encodedMessage("Check your email to confirm your account, then sign in.")}`,
  );
}

export async function signOut() {
  if (!isSupabaseConfigured()) {
    redirect("/");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
