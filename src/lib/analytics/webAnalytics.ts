/**
 * Loads Cloudflare Web Analytics in production only (cookieless, no localStorage).
 * Register the site in Cloudflare dashboard → Web Analytics → manual JS setup.
 */
export function initWebAnalytics(): void {
  if (!import.meta.env.PROD) return;

  const token = import.meta.env.VITE_CF_WEB_ANALYTICS_TOKEN?.trim();
  if (!token) return;

  const script = document.createElement("script");
  script.type = "module";
  script.defer = true;
  script.src = `https://static.cloudflareinsights.com/beacon.min.js?token=${encodeURIComponent(token)}`;
  document.head.appendChild(script);
}
