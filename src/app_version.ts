// The AbstractContinuum version shown in the About dialog. It comes from
// package.json at build time (vite.config.ts `define`), so the About dialog
// always names the build that is running. There is deliberately no
// fallback: a build without the constant fails here, loudly, instead of
// showing "unknown".
export function resolve_app_version(value: unknown): string {
  const version = typeof value === "string" ? value.trim() : "";
  if (!version) throw new Error("AbstractContinuum was built without __APP_VERSION__ (see vite.config.ts define)");
  return version;
}

export const APP_VERSION: string = resolve_app_version(typeof __APP_VERSION__ === "undefined" ? undefined : __APP_VERSION__);
