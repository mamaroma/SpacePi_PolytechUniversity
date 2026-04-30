import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, CircleMarker, Tooltip, AttributionControl } from "react-leaflet";
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

/* Возвращаем только человекочитаемое название.
 * title в манифесте генерируется как «Регион · <имя_файла>» —
 * файловую часть всегда убираем, оставляем только регион. */
function cleanTitle(snap) {
  return snap.region || snap.title || "Снимок";
}

function PhotoCard({ snap, onClose }) {
  const [imgErr, setImgErr] = useState(false);
  const title = cleanTitle(snap);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100000,
        background: "rgba(8,5,18,0.72)",
        backdropFilter: "blur(5px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(420px, 100%)",
          background: "rgba(13,10,24,0.97)",
          border: "1px solid var(--border-hi)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.85)",
          animation: "snap-card-in 0.17s ease",
        }}
      >
        <style>{`
          @keyframes snap-card-in {
            from { opacity:0; transform:translateY(8px) scale(0.97); }
            to   { opacity:1; transform:translateY(0)   scale(1); }
          }
        `}</style>

        {/* Фото */}
        <div style={{
          position: "relative", height: 240,
          background: "#1b1530",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
        }}>
          {imgErr ? (
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🛰</div>
              <div style={{ fontWeight: 600, color: "var(--orange)" }}>Фото загружается</div>
              <div style={{ fontSize: 11, marginTop: 6, color: "var(--text-muted)", lineHeight: 1.5 }}>
                {snap.url}
              </div>
            </div>
          ) : (
            <img
              src={snap.url}
              alt={title}
              loading="eager"
              decoding="async"
              onError={() => setImgErr(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 10, right: 10,
              background: "rgba(0,0,0,0.65)", color: "#f1ead2",
              border: "1px solid rgba(243,151,104,0.5)", borderRadius: 8,
              width: 30, height: 30, fontSize: 16, cursor: "pointer",
              fontWeight: 700, lineHeight: 1, display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
            aria-label="Закрыть"
          >×</button>
        </div>

        {/* Описание */}
        <div style={{ padding: "14px 18px 18px" }}>
          <div style={{
            color: FOLDER_COLORS[snap.folder] || "var(--accent)",
            fontSize: 10, letterSpacing: 1.2, fontWeight: 700,
            textTransform: "uppercase", marginBottom: 6,
          }}>
            {snap.folder}
          </div>
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 17, marginBottom: 8, lineHeight: 1.3 }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
            {snap.lat.toFixed(3)}° N · {snap.lon.toFixed(3)}° E
          </div>
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
            .leaflet-control-zoom a { background: #1b1530 !important; color: #f1ead2 !important; border-color: #8a5ab0 !important; }
            .leaflet-container { background: #0d0a18 !important; cursor: pointer !important; }
            .leaflet-control-attribution { background: rgba(19,14,34,.85) !important; color: #8aa090 !important; font-size: 10px !important; }
            .leaflet-control-attribution a { color: #f39768 !important; }
          `}</style>
          {/* preferCanvas=true + Popup не совместимы — используем только
              eventHandlers.click для открытия карточки через портал */}
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
                radius={8}
                eventHandlers={{
                  click: () => setSelected(s),
                  mouseover: (e) => { e.target.setStyle({ radius: 11, fillOpacity: 1 }); },
                  mouseout: (e) => { e.target.setStyle({ radius: 8, fillOpacity: 0.7 }); },
                }}
                pathOptions={{
                  color: FOLDER_COLORS[s.folder],
                  fillColor: FOLDER_COLORS[s.folder],
                  fillOpacity: 0.7,
                  weight: 2,
                  opacity: 0.9,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.92}>
                  <span style={{ fontFamily: "system-ui", fontSize: 12 }}>
                    {cleanTitle(s)}
                  </span>
                </Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap", alignItems: "center" }}>
          <strong style={{ color: "var(--orange)", letterSpacing: 0.5 }}>Легенда:</strong>
          {FOLDERS.map((f) => (
            <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: FOLDER_COLORS[f], display: "inline-block" }} />
              {f}
            </span>
          ))}
          <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
            Кликните на точку, чтобы открыть снимок · Yandex&nbsp;Cloud
          </span>
        </div>
      </div>

      {/* Карточка снимка — в портале, поверх всего, включая шапку */}
      {selected && createPortal(
        <PhotoCard snap={selected} onClose={() => setSelected(null)} />,
        document.body
      )}
    </div>
  );
}
