import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, AttributionControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { GuideBanner } from "../components/Hint";

/* Базовый URL объект-стораджа Yandex Cloud (бакет проекта).
 * Меняется через .env: VITE_YC_BUCKET_URL=https://storage.yandexcloud.net/<bucket>
 * Если не задан, картинки выводим как «архивные» (placeholder). */
const YC_BUCKET = import.meta.env.VITE_YC_BUCKET_URL ||
  "https://storage.yandexcloud.net/polyspace-photos";

/* Папки → подкаталоги в бакете. Точки разбросаны по соответствующим
 * территориям. Если у конкретной фото ещё нет — превью становится
 * заглушкой и подписывается «архивные данные». */
const FOLDERS = {
  "Полярные фотографии": "polar",
  "Фотографии с КА":     "spacecraft",
};

/* Распределение точек: имя файла + lat/lon + к какой папке относится. */
const SNAPSHOTS = [
  // ── Полярные фотографии ───────────────────────────────
  // Гренландия (различные точки, чтобы они не наложились)
  { id: "p1",  folder: "Полярные фотографии", file: "greenland_01.jpg", lat: 72.5,  lon: -38.5,  region: "Гренландия — ледник",        title: "Ледник Северной Гренландии" },
  { id: "p2",  folder: "Полярные фотографии", file: "greenland_02.jpg", lat: 64.18, lon: -51.75, region: "Гренландия — Нуук",          title: "Окрестности Нуука" },
  { id: "p3",  folder: "Полярные фотографии", file: "greenland_03.jpg", lat: 78.0,  lon: -42.0,  region: "Гренландия — внутренний шит", title: "Купол Гренландии" },
  // Шпицберген
  { id: "p4",  folder: "Полярные фотографии", file: "svalbard_01.jpg",  lat: 78.92, lon: 11.93,  region: "Шпицберген",                  title: "Архипелаг Шпицберген" },
  // Земля Франца-Иосифа
  { id: "p5",  folder: "Полярные фотографии", file: "fjl_01.jpg",       lat: 80.6,  lon: 54.4,   region: "Земля Франца-Иосифа",         title: "Острова Франца-Иосифа" },
  // Новая Земля
  { id: "p6",  folder: "Полярные фотографии", file: "novaya_zemlya.jpg",lat: 73.5,  lon: 55.0,   region: "Новая Земля",                 title: "Северный остров Новой Земли" },
  // Антарктида (несколько точек)
  { id: "p7",  folder: "Полярные фотографии", file: "antarctica_01.jpg",lat: -75.0, lon: 0.0,    region: "Антарктида — Земля Королевы Мод", title: "Земля Королевы Мод" },
  { id: "p8",  folder: "Полярные фотографии", file: "antarctica_02.jpg",lat: -82.0, lon: -50.0,  region: "Антарктида — шельф Ронне",    title: "Шельфовый ледник Ронне" },
  { id: "p9",  folder: "Полярные фотографии", file: "antarctica_03.jpg",lat: -69.0, lon: 78.0,   region: "Антарктида — станция Прогресс", title: "Станция «Прогресс»" },
  // Ямал / Карское море
  { id: "p10", folder: "Полярные фотографии", file: "yamal_01.jpg",     lat: 71.5,  lon: 73.0,   region: "Полуостров Ямал",             title: "Северный Ямал" },
  // Северный полюс
  { id: "p11", folder: "Полярные фотографии", file: "northpole_01.jpg", lat: 89.3,  lon: 35.0,   region: "Дрейф у Северного полюса",    title: "Дрейфующие льды у полюса" },
  // Чукотка
  { id: "p12", folder: "Полярные фотографии", file: "chukotka_01.jpg",  lat: 66.5,  lon: -169.8, region: "Чукотка",                     title: "Берингов пролив" },

  // ── Фотографии с КА ───────────────────────────────────
  { id: "s1",  folder: "Фотографии с КА", file: "ka_baikal.jpg",    lat: 53.9,  lon: 108.0,  region: "Озеро Байкал",            title: "Снимок озера Байкал" },
  { id: "s2",  folder: "Фотографии с КА", file: "ka_caspian.jpg",   lat: 41.0,  lon: 51.0,   region: "Каспийское море",         title: "Каспий с орбиты" },
  { id: "s3",  folder: "Фотографии с КА", file: "ka_kamchatka.jpg", lat: 56.0,  lon: 159.0,  region: "Камчатка",                title: "Вулканы Камчатки" },
  { id: "s4",  folder: "Фотографии с КА", file: "ka_volga.jpg",     lat: 48.7,  lon: 44.5,   region: "Дельта Волги",            title: "Дельта Волги" },
  { id: "s5",  folder: "Фотографии с КА", file: "ka_neva.jpg",      lat: 60.0,  lon: 30.0,   region: "СПб + Финский залив",     title: "Невская губа" },
  { id: "s6",  folder: "Фотографии с КА", file: "ka_himalaya.jpg",  lat: 28.0,  lon: 84.0,   region: "Гималаи",                 title: "Цепь Гималаев" },
  { id: "s7",  folder: "Фотографии с КА", file: "ka_sahara.jpg",    lat: 23.5,  lon: 12.0,   region: "Сахара",                  title: "Дюны Сахары" },
  { id: "s8",  folder: "Фотографии с КА", file: "ka_amazon.jpg",    lat: -3.0,  lon: -60.0,  region: "Амазонка",                title: "Излучина Амазонки" },
  { id: "s9",  folder: "Фотографии с КА", file: "ka_nile.jpg",      lat: 30.05, lon: 31.25,  region: "Дельта Нила",             title: "Каир и дельта Нила" },
  { id: "s10", folder: "Фотографии с КА", file: "ka_australia.jpg", lat: -25.0, lon: 134.0,  region: "Центр Австралии",         title: "Красный центр Австралии" },
  { id: "s11", folder: "Фотографии с КА", file: "ka_andes.jpg",     lat: -16.0, lon: -68.0,  region: "Анды (Боливия)",          title: "Альтиплано" },
  { id: "s12", folder: "Фотографии с КА", file: "ka_pacific.jpg",   lat: -10.0, lon: -160.0, region: "Тихий океан",             title: "Открытый океан" },
  { id: "s13", folder: "Фотографии с КА", file: "ka_japan.jpg",     lat: 35.0,  lon: 138.0,  region: "Япония",                  title: "Токийский залив + Фудзи" },
  { id: "s14", folder: "Фотографии с КА", file: "ka_norway.jpg",    lat: 68.0,  lon: 18.0,   region: "Норвегия — фьорды",       title: "Северные фьорды" },
];

const FOLDER_COLORS = {
  "Полярные фотографии": "#9460b8",
  "Фотографии с КА":     "#f39768",
};

function photoUrl(s) {
  return `${YC_BUCKET}/${FOLDERS[s.folder]}/${s.file}`;
}

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
            <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
            <div style={{ fontWeight: 600, color: "var(--orange)" }}>Фото в обработке</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Архивные данные · файл ещё не выгружен в бакет</div>
          </div>
        ) : (
          <img
            src={photoUrl(snap)}
            alt={snap.title}
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
          {snap.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
          {snap.region}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
          {snap.lat.toFixed(3)}° · {snap.lon.toFixed(3)}°
        </div>
      </div>
    </div>
  );
}

export default function SnapshotsPage() {
  const [activeFolders, setActiveFolders] = useState(new Set(Object.keys(FOLDERS)));
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(
    () => SNAPSHOTS.filter((s) => activeFolders.has(s.folder)),
    [activeFolders]
  );

  const toggleFolder = (f) =>
    setActiveFolders((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  return (
    <div className="app-body">
      <GuideBanner id="snapshots-intro">
        <strong>Снимки.</strong> Карта снимков с бортовых камер спутников и
        полярных экспедиций. Точки сгруппированы по папкам (
        <em>«Полярные фотографии»</em>, <em>«Фотографии с КА»</em>) и
        соответствуют территориям, где было сделано фото. Кликните по точке —
        откроется карточка снимка.
      </GuideBanner>

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Снимки</h1>
          <p className="page-subtitle">
            Фотоархив бортовых камер · Yandex Cloud Storage · {filtered.length} точек
          </p>
        </div>
      </div>

      <div className="controls-card">
        <div className="ctrl-row" style={{ flexWrap: "wrap" }}>
          <span className="ctrl-label" style={{ marginRight: 8 }}>Папки</span>
          {Object.keys(FOLDERS).map((f) => (
            <label key={f} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", marginRight: 14, userSelect: "none" }}>
              <input
                type="checkbox"
                checked={activeFolders.has(f)}
                onChange={() => toggleFolder(f)}
                style={{ accentColor: FOLDER_COLORS[f] }}
              />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: FOLDER_COLORS[f], display: "inline-block" }} />
              {f} ({SNAPSHOTS.filter((s) => s.folder === f).length})
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
          <MapContainer center={[40, 30]} zoom={2} style={{ width: "100%", height: "100%" }} attributionControl={false}>
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
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: FOLDER_COLORS[s.folder], marginBottom: 5 }}>
                      {s.title}
                    </div>
                    <div>{s.region}</div>
                    <div style={{ color: "#cbb98c", fontSize: 10, marginTop: 4 }}>{s.folder}</div>
                    <button
                      onClick={() => setSelected(s)}
                      style={{
                        marginTop: 8, padding: "4px 10px",
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
          {Object.keys(FOLDERS).map((f) => (
            <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: FOLDER_COLORS[f], display: "inline-block" }} />
              {f}
            </span>
          ))}
          <span style={{ marginLeft: "auto" }}>
            Снимки берутся из бакета Yandex&nbsp;Cloud (если файла ещё нет — карточка
            помечается как «архивные»).
          </span>
        </div>
      </div>
    </div>
  );
}
