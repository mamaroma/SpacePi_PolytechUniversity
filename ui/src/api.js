export const API_BASE = import.meta.env.VITE_API_BASE || "";

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

/* ── Satellites / Telemetry ────────────────────────── */

export async function fetchSatellites() {
  return fetchJson(`${API_BASE}/api/satellites`);
}

export async function fetchFleet() {
  return fetchJson(`${API_BASE}/api/satellites/fleet`);
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

export async function runCollect({ sat, days } = {}) {
  const qs = new URLSearchParams();
  if (sat) qs.set("sat", sat);
  if (days) qs.set("days", String(days));

  const r = await fetch(`${API_BASE}/api/collect/run?` + qs.toString(), {
    method: "POST",
  });
  if (!r.ok) {
    let detail = "";
    try { detail = (await r.json()).detail ?? ""; } catch { detail = await r.text().catch(() => ""); }
    throw new Error(`Collect failed HTTP ${r.status}: ${String(detail).slice(0, 200)}`);
  }
  return await r.json();
}

/* ── News ──────────────────────────────────────────── */

export async function fetchNews() {
  return fetchJson(`${API_BASE}/api/news`);
}

export async function fetchNewsById(id) {
  return fetchJson(`${API_BASE}/api/news/${id}`);
}

export async function createNews({ title, description, content, images = [] }, authHeader = {}) {
  const formData = new FormData();
  formData.append("title", title);
  formData.append("description", description);
  formData.append("content", content || description);
  images.forEach((img) => formData.append("images", img));

  const r = await fetch(`${API_BASE}/api/news`, {
    method: "POST",
    headers: { ...authHeader },
    body: formData,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}

export async function updateNews(id, { title, description, content, images = [] }, authHeader = {}) {
  const formData = new FormData();
  formData.append("title", title);
  formData.append("description", description);
  formData.append("content", content || description);
  images.forEach((img) => formData.append("images", img));

  const r = await fetch(`${API_BASE}/api/news/${id}`, {
    method: "PUT",
    headers: { ...authHeader },
    body: formData,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}

export async function deleteNews(id, authHeader = {}) {
  const r = await fetch(`${API_BASE}/api/news/${id}`, {
    method: "DELETE",
    headers: { ...authHeader },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function trackNewsView(id) {
  try {
    return await fetchJson(`${API_BASE}/api/news/${id}/view`, { method: "POST" });
  } catch {
    // non-critical — ignore errors silently
  }
}

/* ── Satellites Info (Documentation) ───────────────── */
export async function fetchSatellitesInfo() {
  return fetchJson(`${API_BASE}/api/satellites/info`);
}

export async function createSatelliteInfo(body, authHeader = {}) {
  const r = await fetch(`${API_BASE}/api/satellites/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

export async function deleteSatelliteInfo(id, authHeader = {}) {
  const r = await fetch(`${API_BASE}/api/satellites/info/${id}`, {
    method: "DELETE",
    headers: { ...authHeader },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ── Decoders for Challenge ─────────────────────────── */
async function _uploadFile(path, file, extraFields = {}) {
  const fd = new FormData();
  fd.append("file", file);
  for (const [k, v] of Object.entries(extraFields)) {
    fd.append(k, String(v));
  }
  const r = await fetch(`${API_BASE}${path}`, { method: "POST", body: fd });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

export const decodeAisFile      = (file) => _uploadFile("/api/decode/ais", file);
export const decodeTelemetryFile = (file) => _uploadFile("/api/decode/telemetry", file);
export const demodulateIqFile   = (file, params = {}) => _uploadFile("/api/decode/iq", file, params);

/**
 * Custom bit-field decoder.
 * @param {File} file  — binary file to decode
 * @param {object} config — { packet_len: number, fields: [{name, bit_offset, bit_length, signed, scale, bit_order}] }
 */
export async function decodeBinaryFile(file, config) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("config", JSON.stringify(config));
  const r = await fetch(`${API_BASE}/api/decode/binary`, { method: "POST", body: fd });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}

/* ── Storage ────────────────────────────────────────── */
export async function fetchStorageList(authHeader = {}, unlockKey = null) {
  const qs = unlockKey ? `?unlock_key=${encodeURIComponent(unlockKey)}` : "";
  const r = await fetch(`${API_BASE}/api/storage${qs}`, { headers: { ...authHeader } });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

export function storageDownloadUrl(kind, name, unlockKey) {
  const qs = unlockKey ? `?unlock_key=${encodeURIComponent(unlockKey)}` : "";
  return `${API_BASE}/api/storage/${kind}/${encodeURIComponent(name)}${qs}`;
}

export async function uploadStorageFile(kind, file, authHeader = {}) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/api/storage/${kind}`, {
    method: "POST",
    headers: { ...authHeader },
    body: fd,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
  }
  return r.json();
}

export async function deleteStorageFile(kind, name, authHeader = {}) {
  const r = await fetch(`${API_BASE}/api/storage/${kind}/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: { ...authHeader },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function fetchStorageSecretKey(authHeader = {}) {
  const r = await fetch(`${API_BASE}/api/storage/_secret_key`, { headers: { ...authHeader } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function fetchDemoEmiPackets() {
  return fetchJson(`${API_BASE}/api/storage/_demo_emi`);
}

/* ── Tele-AIS archive (real data from server) ───────────── */
export async function fetchTeleaisTelemetryList() {
  return fetchJson(`${API_BASE}/api/teleais/telemetry/list`);
}

export function teleaisTelemetryDownloadUrl(satCode) {
  return `${API_BASE}/api/teleais/telemetry/download?sat=${encodeURIComponent(satCode)}`;
}

export async function fetchTeleaisAisList() {
  return fetchJson(`${API_BASE}/api/teleais/ais/list`);
}

export function teleaisAisDownloadUrl(relPath) {
  return `${API_BASE}/api/teleais/ais/download?path=${encodeURIComponent(relPath)}`;
}

export async function fetchTeleaisAisPoints(sats /* string[] | null */) {
  const qs = sats && sats.length
    ? `?sats=${encodeURIComponent(sats.join(","))}`
    : "";
  return fetchJson(`${API_BASE}/api/teleais/ais/points${qs}`);
}

/* ── CNN Gallery ─────────────────────────────────────── */

export async function fetchGallery() {
  return fetchJson(`${API_BASE}/api/gallery`);
}

export async function uploadGalleryPhoto(file, authHeader = {}) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/api/gallery`, {
    method: "POST",
    headers: { ...authHeader },
    body: fd,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}

export async function deleteGalleryPhoto(filename, authHeader = {}) {
  const r = await fetch(`${API_BASE}/api/gallery/${encodeURIComponent(filename)}`, {
    method: "DELETE",
    headers: { ...authHeader },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ── Artek registration & challenges ─────────────────── */
export async function fetchArtekInstructions() {
  return fetchJson(`${API_BASE}/api/artek/instructions`);
}

export async function fetchArtekLevels() {
  return fetchJson(`${API_BASE}/api/artek/levels`);
}

export async function submitArtekRegistration(payload) {
  const r = await fetch(`${API_BASE}/api/artek/registrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}

export async function createArtekChallengeSession({ level, email }) {
  const r = await fetch(`${API_BASE}/api/artek/challenges/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, email: email || null }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}

export function artekChallengeInputUrl(sessionId) {
  return `${API_BASE}/api/artek/challenges/session/${encodeURIComponent(sessionId)}/input.csv`;
}

export async function submitArtekChallengeAnswer(sessionId, file, opts = {}) {
  const fd = new FormData();
  fd.append("file", file);
  if (opts.email) fd.append("email", opts.email);
  fd.append("used_custom_decoder", opts.usedCustomDecoder ? "true" : "false");
  fd.append("has_map_visualization", opts.hasMapVisualization ? "true" : "false");
  const r = await fetch(`${API_BASE}/api/artek/challenges/session/${encodeURIComponent(sessionId)}/submit`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}
