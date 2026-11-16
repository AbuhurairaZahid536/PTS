export function resolvePublicGoogleMapsUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (host === "maps.app.goo.gl" || host === "goo.gl") {
      return host === "goo.gl" && !url.pathname.startsWith("/maps") ? null : url.href;
    }
    if (host === "maps.google.com" || host === "www.google.com" || host === "google.com") {
      return /^(\/maps(?:\/|$)|\/maps\?|\/maps$)/.test(url.pathname + url.search) ? url.href : null;
    }
    return null;
  } catch (_) {
    return null;
  }
}
