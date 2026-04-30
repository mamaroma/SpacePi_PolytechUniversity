import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../AuthContext";
import {
  fetchSatellitesInfo,
  createSatelliteInfo,
  deleteSatelliteInfo,
} from "../api";

const STATUS_LABEL = {
  active:   { label: "На орбите",       color: "var(--accent)" },
  inactive: { label: "Неактивен",       color: "var(--orange)" },
  lost:     { label: "Сошёл с орбиты",  color: "var(--orange-2)" },
};

function Field({ label, value, mono }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="sat-info-field">
      <span className="sat-info-label">{label}</span>
      <span
        className="sat-info-value"
        style={{ fontFamily: mono ? "'Space Mono', monospace" : undefined }}
      >
        {value}
      </span>
    </div>
  );
}

function SatelliteCard({ sat, isEditor, onDelete }) {
  const status = STATUS_LABEL[sat.status] ?? STATUS_LABEL.active;
  return (
    <article className="sat-doc-card">
      {sat.image_url && (
        <div className="sat-doc-image-wrap">
          <img
            src={sat.image_url}
            alt={sat.name_en}
            className="sat-doc-image"
            loading="lazy"
          />
        </div>
      )}
      <header className="sat-doc-header">
        <div>
          <h3 className="sat-doc-title">{sat.name}</h3>
          <div className="sat-doc-subtitle">{sat.name_en}</div>
        </div>
        <span
          className="sat-doc-status"
          style={{ color: status.color, borderColor: status.color }}
        >
          {status.label}
        </span>
      </header>

      <p className="sat-doc-desc">{sat.description}</p>

      {sat.mission && (
        <div className="sat-doc-mission">
          <span className="sat-doc-mission-label">Миссия</span>
          <span>{sat.mission}</span>
        </div>
      )}

      <div className="sat-doc-grid">
        <Field label="NORAD"       value={sat.norad}                     mono />
        <Field label="Запуск"      value={sat.launch_date}               mono />
        <Field label="Орбита"      value={sat.orbit_alt_km && `${sat.orbit_alt_km} км`} mono />
        <Field label="Частота"     value={sat.frequency_mhz && `${sat.frequency_mhz} МГц`} mono />
        <Field label="Протокол"    value={sat.protocol} />
        <Field label="Форм-фактор" value={sat.form_factor} />
        <Field label="Масса"       value={sat.mass_kg && `${sat.mass_kg} кг`} mono />
      </div>

      {(sat.source_url || isEditor) && (
        <footer className="sat-doc-footer">
          {sat.source_url && (
            <a
              href={sat.source_url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
            >
              Источник
            </a>
          )}
          {isEditor && onDelete && (
            <button
              className="btn btn-sm"
              onClick={() => onDelete(sat.id)}
              style={{ color: "var(--orange-2)", marginLeft: "auto" }}
            >
              Удалить
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

const EMPTY_FORM = {
  name: "", name_en: "", norad: "", launch_date: "",
  orbit_alt_km: "", frequency_mhz: "", protocol: "",
  form_factor: "3U CubeSat", mass_kg: "", status: "active",
  description: "", mission: "",
  image_url: "", source_url: "https://spacepi.space",
};

function SatelliteForm({ onSubmit, onCancel, busy }) {
  const [form, setForm] = useState(EMPTY_FORM);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.name_en.trim()) return;
    onSubmit({
      ...form,
      norad:         form.norad         ? Number(form.norad) : null,
      orbit_alt_km:  form.orbit_alt_km  ? Number(form.orbit_alt_km) : null,
      frequency_mhz: form.frequency_mhz ? Number(form.frequency_mhz) : null,
      mass_kg:       form.mass_kg       ? Number(form.mass_kg) : null,
    });
  };

  return (
    <form className="card sat-doc-form" onSubmit={submit}>
      <div className="sat-doc-form-grid">
        <label className="form-label">
          Название (рус) *
          <input className="form-input" required value={form.name} onChange={set("name")} placeholder="Политех Юниверс-7" />
        </label>
        <label className="form-label">
          Name (EN) *
          <input className="form-input" required value={form.name_en} onChange={set("name_en")} placeholder="Polytech Universe-7" />
        </label>
        <label className="form-label">
          NORAD ID
          <input className="form-input" type="number" value={form.norad} onChange={set("norad")} placeholder="61745" />
        </label>
        <label className="form-label">
          Дата запуска
          <input className="form-input" type="date" value={form.launch_date} onChange={set("launch_date")} />
        </label>
        <label className="form-label">
          Высота орбиты (км)
          <input className="form-input" type="number" value={form.orbit_alt_km} onChange={set("orbit_alt_km")} placeholder="565" />
        </label>
        <label className="form-label">
          Частота (МГц)
          <input className="form-input" type="number" step="0.001" value={form.frequency_mhz} onChange={set("frequency_mhz")} placeholder="437.5" />
        </label>
        <label className="form-label">
          Протокол
          <input className="form-input" value={form.protocol} onChange={set("protocol")} placeholder="LoRa SF8 BW 62.5" />
        </label>
        <label className="form-label">
          Форм-фактор
          <input className="form-input" value={form.form_factor} onChange={set("form_factor")} />
        </label>
        <label className="form-label">
          Масса (кг)
          <input className="form-input" type="number" step="0.1" value={form.mass_kg} onChange={set("mass_kg")} />
        </label>
        <label className="form-label">
          Статус
          <select className="form-input" value={form.status} onChange={set("status")}>
            <option value="active">На орбите</option>
            <option value="inactive">Неактивен</option>
            <option value="lost">Потерян</option>
          </select>
        </label>
      </div>

      <label className="form-label">
        Миссия (короткая фраза)
        <input className="form-input" value={form.mission} onChange={set("mission")} placeholder="Мониторинг АИС / телеметрия" />
      </label>
      <label className="form-label">
        Описание
        <textarea className="form-textarea" rows={4} value={form.description} onChange={set("description")} />
      </label>
      <label className="form-label">
        URL изображения (фото спутника)
        <input className="form-input" value={form.image_url} onChange={set("image_url")} placeholder="https://… или /pu7-photo.jpg" />
      </label>
      <label className="form-label">
        Ссылка на источник
        <input className="form-input" value={form.source_url} onChange={set("source_url")} />
      </label>

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Сохранение…" : "Добавить спутник"}
        </button>
        <button type="button" className="btn" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

export default function DocsPage() {
  const { isEditor, authHeader } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchSatellitesInfo());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleCreate = async (body) => {
    setBusy(true);
    try {
      await createSatelliteInfo(body, authHeader);
      setShowForm(false);
      await reload();
    } catch (err) {
      alert("Ошибка: " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Удалить эту карточку?")) return;
    try {
      await deleteSatelliteInfo(id, authHeader);
      await reload();
    } catch (err) {
      alert("Ошибка: " + (err?.message || err));
    }
  };

  return (
    <div className="app-body">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">История проекта · Polytech Universe</h1>
          <p className="page-subtitle">
            Хронология аппаратов программы школьных и студенческих спутников
            СПбПУ Петра&nbsp;Великого.
          </p>
        </div>
        {isEditor && (
          <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Свернуть форму" : "+ Добавить спутник"}
          </button>
        )}
      </div>

      {showForm && isEditor && (
        <SatelliteForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          busy={busy}
        />
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>
          Загрузка…
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>
          Список пуст. {isEditor && "Добавьте первый спутник через форму выше."}
        </div>
      ) : (
        <div className="sat-doc-grid-outer">
          {items.map((s) => (
            <SatelliteCard
              key={s.id}
              sat={s}
              isEditor={isEditor}
              onDelete={isEditor ? handleDelete : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
