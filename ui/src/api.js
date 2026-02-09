export const API_BASE = import.meta.env.VITE_API_BASE || "";
const COLLECT_TOKEN = import.meta.env.VITE_COLLECT_TOKEN || "";

export function isoDaysAgo(days) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  return { from, to };
}

async function fetchJson(url, opts) {
  let r;
  try {
    r = await fetch(url, opts);
  } catch (e) {
    throw new Error(`Network error: ${e?.message ?? e}`);
  }

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }

  return await r.json();
}

export async function fetchSatellites() {
  return fetchJson(`${API_BASE}/api/satellites`);
}

export async function fetchTelemetry({ sat, from, to, limit = 200000 }) {
  const qs = new URLSearchParams({
    sat,
    from: from.toISOString(),
    to: to.toISOString(),
    limit: String(limit),
  });

  return fetchJson(`${API_BASE}/api/telemetry?${qs.toString()}`);
}

export async function fetchOrbitTrack({ sat, at, minutes = 180, step_sec = 20 }) {
  const qs = new URLSearchParams({
    sat,
    at: at.toISOString(),
    minutes: String(minutes),
    step_sec: String(step_sec),
  });

  return fetchJson(`${API_BASE}/api/orbit/track?${qs.toString()}`);
}

export async function runCollect({ sat, days, token } = {}) {
  const qs = new URLSearchParams();
  if (sat) qs.set("sat", sat);
  if (days) qs.set("days", String(days));
  qs.set("token", token ?? COLLECT_TOKEN);

  const r = await fetch(`${API_BASE}/api/collect/run?` + qs.toString(), {
    method: "POST"
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Collect failed: HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return await r.json();
}