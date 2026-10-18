/**
 * True when `email` is the configured admin address. Compared without case or
 * surrounding spaces, since providers and env files differ on both. An unset or
 * blank admin address never matches.
 */
export function isAdminEmail(
  email: string | null | undefined,
  adminEmail: string | undefined,
): boolean {
  const admin = adminEmail?.trim().toLowerCase();
  const candidate = email?.trim().toLowerCase();
  return Boolean(admin) && Boolean(candidate) && candidate === admin;
}
