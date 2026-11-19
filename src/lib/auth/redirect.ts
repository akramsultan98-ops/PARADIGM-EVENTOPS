/** Post-login redirect target: only same-origin relative paths; rejects "//host", "/\host" and control characters (open-redirect guard). */
export function safeNext(next?: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return "/dashboard";
  return next;
}
