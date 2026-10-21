type SupabaseError = {
  code?: string;
  message?: string;
};

export function profileTableMessage(error: SupabaseError) {
  if (
    error.code === "PGRST205" ||
    error.message?.includes("public.profiles")
  ) {
    return "The Supabase profiles table is not set up yet. Run supabase/profiles.sql in your Supabase SQL editor, then refresh this page.";
  }

  return error.message ?? "Something went wrong with the profiles table.";
}
