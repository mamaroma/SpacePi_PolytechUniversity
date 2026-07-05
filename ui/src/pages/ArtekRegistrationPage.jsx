import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import SpaceBackground from "../components/SpaceBackground";
import {
  artekChallengeInputUrl,
  createArtekChallengeSession,
  fetchArtekInstructions,
  fetchArtekLevels,
  submitArtekChallengeAnswer,
  submitArtekRegistration,
} from "../api";

function splitInstructions(text) {
  return (text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function ParticipantMap({ points }) {
  const valid = (points || []).filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)
  );
  if (!valid.length) {
    return <p className="artek-muted">Нет координат для карты в ответе участника.</p>;
  }
  const center = [
    valid.reduce((s, p) => s + p.lat, 0) / valid.length,
    valid.reduce((s, p) => s + p.lon, 0) / valid.length,
  ];
  const tracks = {};
  for (const p of valid) {
    const key = String(p.mmsi || "unknown");
    if (!tracks[key]) tracks[key] = [];
    tracks[key].push([p.lat, p.lon]);
  }
  return (
    <div className="artek-map-wrap">
      <MapContainer center={center} zoom={6} style={{ height: 320, width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {Object.entries(tracks).map(([mmsi, coords]) =>
          coords.length > 1 ? (
            <Polyline key={`line-${mmsi}`} positions={coords} pathOptions={{ color: "#f39768", weight: 2 }} />
          ) : null
        )}
        {valid.map((p, i) => (
          <CircleMarker
            key={`${p.mmsi}-${i}`}
            center={[p.lat, p.lon]}
            radius={6}
            pathOptions={{ color: "#9460b8", fillColor: "#724796", fillOpacity: 0.85 }}
          >
            <Popup>
              MMSI: {p.mmsi}<br />
              Speed: {p.speed ?? "—"}<br />
              {p.last_seen ? <>Time: {p.last_seen}</> : null}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function ChallengePanel({ levelMeta, registrantEmail }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [usedCustomDecoder, setUsedCustomDecoder] = useState(false);
  const [hasMapVisualization, setHasMapVisualization] = useState(false);

  const startSession = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await createArtekChallengeSession({
        level: levelMeta.level,
        email: registrantEmail || null,
      });
      setSession(data);
    } catch (e) {
      setError(e?.message || "Не удалось создать задание");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !session?.session_id) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await submitArtekChallengeAnswer(session.session_id, file, {
        email: registrantEmail || null,
        usedCustomDecoder,
        hasMapVisualization,
      });
      setResult(res);
    } catch (err) {
      setError(err?.message || "Не удалось проверить ответ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="artek-level-card">
      <div className="artek-level-head">
        <div>
          <h3>{levelMeta.title}</h3>
          <p className="artek-level-sub">{levelMeta.subtitle}</p>
        </div>
        <span className="artek-level-score">до {levelMeta.max_score} б.</span>
      </div>
      <p className="artek-level-task">{levelMeta.task}</p>
      <p className="artek-muted">Формат ответа: <code>{levelMeta.expected_format}</code></p>

      <div className="artek-level-actions">
        <button type="button" className="btn btn-primary" onClick={startSession} disabled={loading}>
          {loading ? "Генерация..." : "Получить задание"}
        </button>
        {session?.session_id && (
          <a className="btn" href={artekChallengeInputUrl(session.session_id)} download>
            Скачать input.csv
          </a>
        )}
      </div>

      {session?.input_preview?.length > 0 && (
        <div className="artek-table-wrap">
          <table className="artek-table">
            <thead>
              <tr>
                <th>timestamp</th>
                <th>ais_sentence</th>
              </tr>
            </thead>
            <tbody>
              {session.input_preview.map((row, i) => (
                <tr key={i}>
                  <td>{row.timestamp}</td>
                  <td className="mono">{row.ais_sentence}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="artek-muted">Показаны первые строки. Полный набор — в input.csv ({session.packet_count} пакетов).</p>
        </div>
      )}

      {session?.session_id && (
        <div className="artek-submit-block">
          <label className="artek-consent">
            <input type="checkbox" checked={usedCustomDecoder} onChange={(e) => setUsedCustomDecoder(e.target.checked)} />
            <span>Использовал собственный декодер (доп. баллы)</span>
          </label>
          {levelMeta.level >= 2 && (
            <label className="artek-consent">
              <input type="checkbox" checked={hasMapVisualization} onChange={(e) => setHasMapVisualization(e.target.checked)} />
              <span>Есть собственная визуализация / карта (доп. баллы)</span>
            </label>
          )}
          <label className="btn btn-success" style={{ cursor: "pointer", width: "fit-content" }}>
            {submitting ? "Проверка..." : "Загрузить ответ CSV"}
            <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onSubmitFile} disabled={submitting} />
          </label>
        </div>
      )}

      {error && <p className="artek-error">{error}</p>}

      {result && (
        <div className="artek-result">
          <h4>Результат проверки</h4>
          <p>
            Баллы: <strong>{result.score_total}</strong> / {result.max_score}
            {" "}(совпало строк: {result.matched} из {result.reference_rows})
          </p>
          {result.details && (
            <ul className="artek-result-details">
              {Object.entries(result.details).map(([k, v]) => (
                <li key={k}>{k}: {v}</li>
              ))}
            </ul>
          )}
          {result.participant_points?.length > 0 && levelMeta.level >= 2 && (
            <>
              <h4>Карта вашего ответа</h4>
              <ParticipantMap points={result.participant_points} />
            </>
          )}
        </div>
      )}
    </article>
  );
}

export default function ArtekRegistrationPage() {
  const [instructions, setInstructions] = useState("");
  const [levels, setLevels] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitInfo, setSubmitInfo] = useState("");
  const [registrantEmail, setRegistrantEmail] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    birth_date: "",
    school: "",
    country: "",
    email: "",
    consent_personal_data: false,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingMeta(true);
      try {
        const [instr, lvls] = await Promise.all([
          fetchArtekInstructions().catch(() => ({ text: "" })),
          fetchArtekLevels().catch(() => []),
        ]);
        if (!mounted) return;
        setInstructions(instr?.text || "");
        setLevels(Array.isArray(lvls) ? lvls : []);
      } finally {
        if (mounted) setLoadingMeta(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const instructionParagraphs = useMemo(() => splitInstructions(instructions), [instructions]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitInfo("");
    if (!form.consent_personal_data) {
      setSubmitInfo("Для регистрации нужно согласие на обработку персональных данных.");
      return;
    }
    setSubmitting(true);
    try {
      await submitArtekRegistration(form);
      setRegistrantEmail(form.email);
      setSubmitInfo("Заявка сохранена в базе. Можно переходить к практическим заданиям ниже.");
      setForm({
        full_name: "",
        birth_date: "",
        school: "",
        country: "",
        email: "",
        consent_personal_data: false,
      });
    } catch (err) {
      setSubmitInfo(err?.message || "Не удалось отправить заявку.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-wrap artek-page">
      <SpaceBackground />

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Artek registration</h1>
          <p className="page-subtitle">Регистрация и отборочные испытания по AIS</p>
        </div>
      </div>

      <section className="card artek-card artek-form-card">
        <h2 className="artek-section-title">Регистрация участника</h2>
        <form className="artek-form" onSubmit={onSubmit}>
          <label className="form-label">
            ФИО
            <input className="form-input" name="full_name" value={form.full_name} onChange={onChange} required />
          </label>
          <label className="form-label">
            Дата рождения
            <input type="date" className="form-input" name="birth_date" value={form.birth_date} onChange={onChange} required />
          </label>
          <label className="form-label">
            Школа
            <input className="form-input" name="school" value={form.school} onChange={onChange} required />
          </label>
          <label className="form-label">
            Страна
            <input className="form-input" name="country" value={form.country} onChange={onChange} required />
          </label>
          <label className="form-label">
            E-mail
            <input type="email" className="form-input" name="email" value={form.email} onChange={onChange} required />
          </label>
          <label className="artek-consent">
            <input type="checkbox" name="consent_personal_data" checked={form.consent_personal_data} onChange={onChange} />
            <span>Согласен(на) на обработку персональных данных</span>
          </label>
          <div className="artek-form-actions">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Отправка..." : "Отправить заявку"}
            </button>
            {submitInfo && <span className="artek-submit-info">{submitInfo}</span>}
          </div>
        </form>
      </section>

      <section className="card artek-card">
        <h2 className="artek-section-title">Инструкция отборочного этапа</h2>
        {loadingMeta ? (
          <p className="artek-muted">Загрузка инструкции...</p>
        ) : instructionParagraphs.length === 0 ? (
          <p className="artek-muted">Текст инструкции временно недоступен.</p>
        ) : (
          <div className="artek-instruction-text">
            {instructionParagraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
      </section>

      <section className="card artek-card">
        <h2 className="artek-section-title">Практические кейсы (проверка на сайте)</h2>
        <p className="artek-muted">
          Сервер генерирует уникальный набор пакетов. Эталон хранится только на сервере и не выдаётся участнику.
          Загрузите свой CSV-ответ — система автоматически проверит результат и покажет карту только ваших данных.
        </p>
        <div className="artek-levels-grid">
          {levels.map((lvl) => (
            <ChallengePanel key={lvl.level} levelMeta={lvl} registrantEmail={registrantEmail} />
          ))}
        </div>
      </section>
    </div>
  );
}
