// Cloudflare Worker: a private CORS proxy for your Google Calendar secret iCal URL.
// Deploy: dash.cloudflare.com → Workers → Create → paste this → Deploy.
// Then in hz/home settings set Proxy URL to: https://<your-worker>.workers.dev/?url=
//
// Only Google Calendar iCal URLs are allowed, and only your site may call it,
// so nobody can use it as an open proxy.

const ALLOWED_ORIGINS = ["https://www.hantunzaw.dev", "http://localhost:8080", "http://127.0.0.1:8080"];

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response("Forbidden", { status: 403, headers: cors });

    const target = new URL(request.url).searchParams.get("url") || "";
    let url;
    try { url = new URL(target); } catch { return new Response("Bad url", { status: 400, headers: cors }); }
    if (url.protocol !== "https:" || url.hostname !== "calendar.google.com" || !url.pathname.startsWith("/calendar/ical/")) {
      return new Response("Only Google Calendar iCal URLs are allowed", { status: 400, headers: cors });
    }

    const upstream = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
    });
  },
};
