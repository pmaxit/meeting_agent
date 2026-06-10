/**
 * Whether email sign-in may skip SMTP and authenticate immediately.
 * Production requires VEXA_ALLOW_DIRECT_LOGIN=true explicitly.
 * Local npm dev on localhost is allowed when NODE_ENV=development.
 */
export function isDirectLoginAllowed(origin?: string | null): boolean {
  const flag = (process.env.VEXA_ALLOW_DIRECT_LOGIN || "").toLowerCase();
  if (["1", "true", "yes"].includes(flag)) {
    return true;
  }

  if (process.env.NODE_ENV !== "development") {
    return false;
  }

  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
    origin,
  ].filter(Boolean) as string[];

  return candidates.some((url) => /localhost|127\.0\.0\.1|\[::1\]/i.test(url));
}
