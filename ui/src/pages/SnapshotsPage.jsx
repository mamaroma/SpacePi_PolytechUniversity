import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, AttributionControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { GuideBanner } from "../components/Hint";

/* Манифест с реально выгруженными в бакет Yandex Cloud снимками.
 * Формируется скриптом scripts/upload_snapshots_to_yc.py — туда же
 * прописываются прямые public-URL'ы. */
const MANIFEST_URL = "/snapshots-manifest.json";

/* Папки → подкаталоги в бакете. Точки разбросаны по соответствующим
 * территориям. Если у конкретной фото ещё нет — превью становится
 * заглушкой и подписывается «архивные данные». */
const FOLDERS = ["Полярные фотографии", "Фотографии с КА"];

const FOLDER_COLORS = {
  "Полярные фотографии": "#9460b8",
  "Фотографии с КА":     "#f39768",
};

function PhotoCard({ snap, onClose }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div style={{
      position: "absolute",
      right: 16, top: 16, zIndex: 1000,
      width: 360,
      background: "rgba(13,10,24,0.95)",
      border: "1px solid var(--border-hi)",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 16px 40px rgba(0,0,0,0.7)",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        position: "relative",
        height: 220,
        background: "#1b1530",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {imgErr ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 16 }}>
            <div style={{ fontWeight: 600, color: "var(--orange)" }}>Фото в обработке</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Архивные данные · файл ещё не выгружен в бакет</div>
          </div>
        ) : (
          <img
            src={snap.url}
            alt={snap.title}
            loading="lazy"
            decoding="async"
            onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 8, right: 8,
            background: "rgba(0,0,0,0.6)", color: "#f1ead2",
            border: "none", borderRadius: 8,
            padding: "5px 10px", fontSize: 14, cursor: "pointer",
            fontWeight: 700,
          }}
        >×</button>
      </div>
      <div style={{ padding: "12px 16px 14px" }}>
        <div style={{
          color: FOLDER_COLORS[snap.folder] || "var(--accent)",
          fontSize: 10, letterSpacing: 1, fontWeight: 700,
          textTransform: "uppercase", marginBottom: 4,
        }}>
          {snap.folder}
        </div>
        <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 16, marginBottom: 6 }}>
          {snap.region}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
          {snap.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
          {snap.lat.toFixed(3)}° · {snap.lon.toFixed(3)}°
        </div>
      </div>
    </div>
  );
}

export default function SnapshotsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFolders, setActiveFolders] = useState(new Set(FOLDERS));
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(MANIFEST_URL, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => { if (alive) setItems(Array.isArray(j?.items) ? j.items : []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(
    () => items.filter((s) => activeFolders.has(s.folder)),
    [items, activeFolders]
  );

  const toggleFolder = (f) =>
    setActiveFolders((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const folderCounts = useMemo(() => {
    const m = {};
    for (const s of items) m[s.folder] = (m[s.folder] || 0) + 1;
    return m;
  }, [items]);

  return (
    <div className="app-body">
      <GuideBanner id="snapshots-intro">
        <strong>Снимки.</strong> Карта снимков с бортовых камер спутников и
        полярных экспедиций. Точки сгруппированы по папкам (
        <em>«Полярные фотографии»</em>, <em>«Фотографии с КА»</em>) и
        соответствуют территориям, где было сделано фото. Кликните по точке —
        откроется карточка снимка. Изображения хранятся в бакете
        <em> Yandex&nbsp;Cloud Object Storage</em>.
      </GuideBanner>

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Снимки</h1>
          <p className="page-subtitle">
            Фотоархив бортовых камер · Yandex&nbsp;Cloud Storage ·{" "}
            {loading ? "загрузка манифеста…" : `${filtered.length} точек на карте`}
          </p>
        </div>
      </div>

      <div className="controls-card">
        <div className="ctrl-row" style={{ flexWrap: "wrap" }}>
          <span className="ctrl-label" style={{ marginRight: 8 }}>Папки</span>
          {FOLDERS.map((f) => (
            <label key={f} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", marginRight: 14, userSelect: "none" }}>
              <input
                type="checkbox"
                checked={activeFolders.has(f)}
                onChange={() => toggleFolder(f)}
                style={{ accentColor: FOLDER_COLORS[f] }}
              />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: FOLDER_COLORS[f], display: "inline-block" }} />
              {f} ({folderCounts[f] || 0})
            </label>
          ))}
          <div className="ctrl-spacer" />
          <span className="card-meta">{filtered.length} снимков</span>
        </div>
      </div>

      <div className="globe-card">
        <div className="card-header">
          <span className="card-title">Карта снимков</span>
          <span className="card-meta">{filtered.length} точек</span>
        </div>
        <div className="globe-inner" style={{ height: 600, position: "relative" }}>
          <style>{`
            .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #1b1530 !important; color: #f1ead2 !important; border: 1px solid #8a5ab0 !important; border-radius: 10px !important; box-shadow: 0 8px 24px rgba(0,0,0,.6) !important; }
            .leaflet-popup-content { margin: 10px 14px !important; }
            .leaflet-control-zoom a { background: #1a3220 !important; color: #f1ead2 !important; border-color: #3a5e3f !important; }
            .leaflet-container { background: #0d0a18 !important; }
            .leaflet-control-attribution { background: rgba(26,50,32,.85) !important; color: #8aa090 !important; font-size: 10px !important; }
            .leaflet-control-attribution a { color: #f39768 !important; }
          `}</style>
          <MapContainer center={[40, 30]} zoom={2} style={{ width: "100%", height: "100%" }} attributionControl={false} preferCanvas>
            <AttributionControl position="bottomright" prefix={false} />
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &amp; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />
            {filtered.map((s) => (
              <CircleMarker
                key={s.id}
                center={[s.lat, s.lon]}
                radius={7}
                eventHandlers={{ click: () => setSelected(s) }}
                pathOptions={{
                  color: FOLDER_COLORS[s.folder],
                  fillColor: FOLDER_COLORS[s.folder],
                  fillOpacity: 0.7,
                  weight: 2,
                  opacity: 0.9,
                }}
              >
                <Popup>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, maxWidth: 220 }}>
                    <div style={{ fontWeight: 700, color: FOLDER_COLORS[s.folder], marginBottom: 5 }}>
                      {s.region}
                    </div>
                    <div style={{ fontSize: 11, color: "#cbb98c", marginBottom: 6 }}>{s.title}</div>
                    <button
                      onClick={() => setSelected(s)}
                      style={{
                        marginTop: 4, padding: "4px 10px",
                        background: FOLDER_COLORS[s.folder], color: "#0d0a18",
                        border: "none", borderRadius: 6, fontSize: 11,
                        fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Открыть фото
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          {selected && <PhotoCard snap={selected} onClose={() => setSelected(null)} />}
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ color: "var(--orange)", letterSpacing: 0.5 }}>Легенда:</strong>
          {FOLDERS.map((f) => (
            <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: FOLDER_COLORS[f], display: "inline-block" }} />
              {f}
            </span>
          ))}
          <span style={{ marginLeft: "auto" }}>
            Снимки берутся напрямую из бакета Yandex&nbsp;Cloud
          </span>
        </div>
      </div>
    </div>
  );
}
