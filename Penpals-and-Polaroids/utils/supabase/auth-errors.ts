type AuthError = {
  message?: string;
};

export function authMessage(error: AuthError) {
  const message = error.message ?? "Authentication failed.";
  const normalized = message.toLowerCase();

  if (normalized.includes("email rate limit exceeded")) {
    return "Supabase has temporarily paused confirmation emails for this project. Wait a few minutes before trying again, or sign in if you already created this account.";
  }

  return message;
}
