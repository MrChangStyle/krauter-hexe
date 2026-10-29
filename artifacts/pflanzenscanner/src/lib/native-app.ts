/**
 * The store apps (docs/app-stores.md) are a Capacitor shell around the web
 * app: Capacitor puts its bridge on window. Some things differ there – Google
 * refuses sign-in inside an embedded web view ("disallowed_useragent").
 */
export function isNativeApp(win: unknown = typeof window === "undefined" ? undefined : window): boolean {
  const cap = (win as { Capacitor?: { isNativePlatform?: () => boolean } } | undefined)?.Capacitor;
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform() === true;
}
