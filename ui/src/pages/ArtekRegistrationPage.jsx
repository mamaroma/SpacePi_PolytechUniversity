import React, { useEffect, useMemo, useState } from "react";
import SpaceBackground from "../components/SpaceBackground";
import {
  artekFileDownloadUrl,
  fetchArtekFiles,
  submitArtekRegistration,
} from "../api";

function bytesToHuman(size) {
  if (!Number.isFinite(size) || size < 1024) return `${size || 0} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ArtekRegistrationPage() {
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [errorFiles, setErrorFiles] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitInfo, setSubmitInfo] = useState("");
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
      setLoadingFiles(true);
      setErrorFiles("");
      try {
        const list = await fetchArtekFiles();
        if (mounted) setFiles(Array.isArray(list) ? list : []);
      } catch (e) {
        if (mounted) setErrorFiles(e?.message || "Не удалось загрузить файлы");
      } finally {
        if (mounted) setLoadingFiles(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const hasConsent = useMemo(() => !!form.consent_personal_data, [form.consent_personal_data]);

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitInfo("");
    if (!hasConsent) {
      setSubmitInfo("Для регистрации нужно согласие на обработку персональных данных.");
      return;
    }
    setSubmitting(true);
    try {
      await submitArtekRegistration(form);
      setSubmitInfo("Заявка отправлена. Мы свяжемся по указанной почте.");
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
    <div className="page-wrap">
      <SpaceBackground />

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Artek registration</h1>
          <p className="page-subtitle">
            Отборочные испытания по AIS: материалы, требования и подача заявки.
          </p>
        </div>
      </div>

      <section className="card artek-card">
        <h2 className="artek-section-title">Что нужно сделать участнику</h2>
        <ol className="artek-steps">
          <li>Разобраться с генератором AIS-пакетов (`main.py`) и уровнями 1-4.</li>
          <li>Подготовить собственный декодер и положить его как `participant_decoder.py`.</li>
          <li>Сделать простую визуализацию своих данных и приложить как `map.py` (допзадание).</li>
          <li>Собрать решение в структуре, которая запускается из коробки без PyQt.</li>
          <li>Сдать результаты и проверить их через `competition_runner.py`.</li>
        </ol>
      </section>

      <section className="card artek-card">
        <h2 className="artek-section-title">Материалы отборочного этапа</h2>
        {loadingFiles ? (
          <p className="artek-muted">Загрузка файлов...</p>
        ) : errorFiles ? (
          <p className="artek-error">{errorFiles}</p>
        ) : files.length === 0 ? (
          <p className="artek-muted">Файлы пока не опубликованы.</p>
        ) : (
          <div className="artek-file-grid">
            {files.map((f) => (
              <a
                className="artek-file-link"
                key={f.name}
                href={artekFileDownloadUrl(f.name)}
                target="_blank"
                rel="noreferrer"
              >
                <strong>{f.name}</strong>
                <span>{bytesToHuman(f.size_bytes)}</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="card artek-card">
        <h2 className="artek-section-title">Форма регистрации</h2>
        <form className="artek-form" onSubmit={onSubmit}>
          <label className="form-label">
            ФИО
            <input
              className="form-input"
              name="full_name"
              value={form.full_name}
              onChange={onChange}
              required
            />
          </label>
          <label className="form-label">
            Дата рождения
            <input
              type="date"
              className="form-input"
              name="birth_date"
              value={form.birth_date}
              onChange={onChange}
              required
            />
          </label>
          <label className="form-label">
            Школа
            <input
              className="form-input"
              name="school"
              value={form.school}
              onChange={onChange}
              required
            />
          </label>
          <label className="form-label">
            Страна
            <input
              className="form-input"
              name="country"
              value={form.country}
              onChange={onChange}
              required
            />
          </label>
          <label className="form-label">
            E-mail
            <input
              type="email"
              className="form-input"
              name="email"
              value={form.email}
              onChange={onChange}
              required
            />
          </label>

          <label className="artek-consent">
            <input
              type="checkbox"
              name="consent_personal_data"
              checked={form.consent_personal_data}
              onChange={onChange}
            />
            <span>Согласен(на) на обработку персональных данных.</span>
          </label>

          <div className="artek-form-actions">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Отправка..." : "Отправить заявку"}
            </button>
            {submitInfo && <span className="artek-submit-info">{submitInfo}</span>}
          </div>
        </form>
      </section>
    </div>
  );
}
