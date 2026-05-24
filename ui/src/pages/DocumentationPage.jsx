import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, Link, useParams, Navigate } from "react-router-dom";

import { SATELLITE_DOCS, SATELLITE_DOCS_INDEX } from "../data/satelliteDocs";

/* ───────────────────────────── styles ───────────────────────────── */

const SECTION_CARD = {
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  padding: 22,
};

const SUBTITLE_STYLE = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: "var(--orange)",
  marginBottom: 8,
};

/* ───────────────────────────── overview ─────────────────────────── */

function OverviewCard({ to, accent, eyebrow, title, description, items }) {
  return (
    <Link
      to={to}
      style={{
        ...SECTION_CARD,
        padding: 28,
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        transition: "border-color 0.18s, box-shadow 0.18s, transform 0.15s",
        borderColor: `${accent}55`,
        background: `linear-gradient(135deg, ${accent}10 0%, var(--surface-1) 70%)`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.boxShadow = `0 0 28px ${accent}33`;
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = `${accent}55`;
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: accent,
        }}
      >
        {eyebrow}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
        {title}
      </div>
      <p style={{ margin: 0, color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6 }}>
        {description}
      </p>
      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          color: "var(--text-muted)",
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
      <span
        style={{
          alignSelf: "flex-start",
          marginTop: "auto",
          fontSize: 13,
          color: accent,
          fontWeight: 600,
        }}
      >
        Открыть →
      </span>
    </Link>
  );
}

function DocOverview() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
      <OverviewCard
        to="/documentation/technical"
        accent="#f39768"
        eyebrow="01"
        title="Техническая документация"
        description="Полное описание автоматизированного наземного комплекса приёма УКВ-диапазона: антенна, поворотное устройство, фильтры, СДР-приёмник и ПО."
        items={[
          "Структурная схема приёма",
          "Антенна X-Quad и позиционер G-5500",
          "Фильтры и LNA",
          "СДР-приёмник и обработка сигнала",
        ]}
      />
      <OverviewCard
        to="/documentation/satellites"
        accent="#9460b8"
        eyebrow="02"
        title="Документация по спутникам"
        description="Карточки каждого аппарата серии «Политех Юниверс» (PU-1 … PU-6): запуск, орбита, полезная нагрузка, протоколы передачи телеметрии и текущий статус."
        items={[
          "PU-1, PU-2 — миссия ЭМИ-мониторинга",
          "PU-3 — приём AIS и космическая погода",
          "PU-4, PU-5 — телеметрия и эксперименты со связью",
          "PU-6 — ДЗЗ в радиочастотном диапазоне (16U)",
        ]}
      />
    </div>
  );
}

/* ───────────────────────── technical docs ───────────────────────── */

/**
 * Рендерим JSON, который мы заранее распарсили из «документация.docx»
 * скриптом в репо. В корне — массив блоков (параграфы и таблицы).
 */
function renderRuns(runs) {
  return runs.map((r, i) => {
    if (r.type === "image") {
      return (
        <img
          key={i}
          src={r.src}
          alt=""
          loading="lazy"
          style={{
            display: "block",
            maxWidth: "100%",
            margin: "16px auto",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "#0f0a1f",
            boxShadow: "0 6px 22px rgba(0,0,0,0.55)",
          }}
        />
      );
    }
    if (r.type === "text") {
      const text = r.text;
      const parts = text.split("\n");
      return (
        <React.Fragment key={i}>
          {parts.map((p, idx) => {
            const styled = r.bold || r.italic ? (
              <span
                style={{
                  fontWeight: r.bold ? 700 : undefined,
                  fontStyle: r.italic ? "italic" : undefined,
                  color: r.bold ? "var(--text)" : "inherit",
                }}
              >
                {p}
              </span>
            ) : (
              p
            );
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <br />}
                {styled}
              </React.Fragment>
            );
          })}
        </React.Fragment>
      );
    }
    return null;
  });
}

/**
 * Угадываем тип параграфа по содержимому:
 *  - голая жирная короткая строка / нумерованная "N. " → заголовок секции
 *  - "N.M …" → подзаголовок
 *  - всё прочее → обычный текст.
 *
 * Это эвристика, но docx из ТЗ почти без стилей, поэтому без неё
 * получится сплошная стена текста.
 */
function classifyParagraph(block) {
  const text = (block.runs || [])
    .filter((r) => r.type === "text")
    .map((r) => r.text)
    .join("")
    .trim();

  if (!text) return "blank";

  // «1.», «1.1», «2.3», etc.
  const sectionMatch = text.match(/^(\d+)\.\s/);
  const subMatch = text.match(/^(\d+)\.(\d+)\s/);
  const subDotMatch = text.match(/^(\d+)\.(\d+)\./);

  if (subMatch || subDotMatch) return "h3";
  if (sectionMatch && text.length < 120 && (block.runs || []).some((r) => r.bold)) return "h2";
  if ((block.runs || []).every((r) => r.type !== "text" || r.bold) && text.length < 90) {
    return "h2";
  }
  return "p";
}

function ParagraphBlock({ block }) {
  const kind = classifyParagraph(block);

  // empty paragraph -> small gap
  if (kind === "blank") {
    return <div style={{ height: 4 }} />;
  }

  if (kind === "h2") {
    return (
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "var(--text)",
          margin: "32px 0 14px",
          paddingBottom: 6,
          borderBottom: "1px solid var(--border-hi, var(--border))",
        }}
      >
        {renderRuns(block.runs)}
      </h2>
    );
  }

  if (kind === "h3") {
    return (
      <h3
        style={{
          fontSize: 17,
          fontWeight: 700,
          color: "var(--orange)",
          margin: "22px 0 8px",
        }}
      >
        {renderRuns(block.runs)}
      </h3>
    );
  }

  return (
    <p
      style={{
        margin: "0 0 12px",
        fontSize: 14,
        lineHeight: 1.75,
        color: "var(--text-dim)",
      }}
    >
      {renderRuns(block.runs)}
    </p>
  );
}

function TableBlock({ block }) {
  // Простейшая 2-колоночная таблица: «параметр / значение».
  // Если столбцов больше — выводим всё как есть.
  const rows = block.rows || [];
  if (rows.length === 0) return null;

  return (
    <div
      style={{
        overflowX: "auto",
        margin: "16px 0 22px",
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--surface-1)",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              style={{
                background: ri % 2 ? "transparent" : "rgba(114,71,150,0.06)",
              }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "10px 14px",
                    color: ci === 0 ? "var(--text)" : "var(--text-dim)",
                    fontWeight: ci === 0 ? 600 : 400,
                    verticalAlign: "top",
                    borderRight: ci < row.length - 1 ? "1px solid var(--border)" : "none",
                    borderTop: ri ? "1px solid var(--border)" : "none",
                    lineHeight: 1.55,
                  }}
                >
                  {cell.map((sub, sj) =>
                    sub.type === "table" ? (
                      <TableBlock key={sj} block={sub} />
                    ) : (
                      <div key={sj}>{renderRuns(sub.runs || [])}</div>
                    )
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TechnicalDocs() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/docs/tech/document.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 18, color: "var(--text-muted)", fontSize: 13 }}>
        <Link to="/documentation" style={{ color: "var(--orange)", textDecoration: "none" }}>
          ← Документация
        </Link>
        <span style={{ margin: "0 8px", opacity: 0.4 }}>/</span>
        Техническая документация
      </div>

      <h1 className="page-title">Техническая документация</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>
        Автоматизированный измерительный наземный комплекс приёма УКВ-диапазона
        с управляемой антенной системой.
      </p>

      {error && (
        <div
          style={{
            padding: 20,
            borderRadius: 10,
            background: "rgba(218,73,39,0.08)",
            border: "1px solid rgba(218,73,39,0.3)",
            color: "#f39768",
          }}
        >
          Не удалось загрузить документ: {error}
        </div>
      )}

      {!error && !data && (
        <div style={{ color: "var(--text-muted)", padding: 20 }}>Загрузка документа…</div>
      )}

      {data && (
        <article
          style={{
            ...SECTION_CARD,
            padding: "32px 36px",
            maxWidth: 980,
          }}
        >
          {(data.blocks || []).map((b, i) =>
            b.type === "table" ? (
              <TableBlock key={i} block={b} />
            ) : (
              <ParagraphBlock key={i} block={b} />
            )
          )}
        </article>
      )}
    </div>
  );
}

/* ───────────────────────── satellites docs ─────────────────────── */

function SatellitesIndex() {
  return (
    <div>
      <div style={{ marginBottom: 18, color: "var(--text-muted)", fontSize: 13 }}>
        <Link to="/documentation" style={{ color: "var(--accent-2)", textDecoration: "none" }}>
          ← Документация
        </Link>
        <span style={{ margin: "0 8px", opacity: 0.4 }}>/</span>
        Документация по спутникам
      </div>

      <h1 className="page-title">Документация по спутникам</h1>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>
        Серия малых космических аппаратов СПбПУ Петра Великого — Polytech Universe.
        По каждому борту собрана техническая карточка: запуск, орбита, полезная
        нагрузка, статус миссии.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {SATELLITE_DOCS.map((sat) => {
          const accent = sat.status === "active" ? "#6cc77b"
                       : sat.status === "lost"   ? "#f39768"
                       : "#9460b8";
          return (
            <Link
              key={sat.id}
              to={`/documentation/satellites/${sat.id}`}
              style={{
                ...SECTION_CARD,
                padding: 18,
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                transition: "border-color 0.18s, box-shadow 0.18s, transform 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = accent;
                e.currentTarget.style.boxShadow = `0 0 22px ${accent}33`;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: accent }}>
                  {sat.shortCode}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: `${accent}18`,
                    color: accent,
                    border: `1px solid ${accent}55`,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    fontWeight: 700,
                  }}
                >
                  {sat.statusLabel}
                </span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
                {sat.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {sat.subtitle}
              </div>
              <ul
                style={{
                  margin: "6px 0 0",
                  paddingLeft: 16,
                  fontSize: 12,
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                }}
              >
                {sat.headlineFacts.slice(0, 3).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <span style={{ marginTop: "auto", paddingTop: 8, fontSize: 12, color: accent, fontWeight: 600 }}>
                Подробнее →
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SatelliteDetail() {
  const { satId } = useParams();
  const sat = SATELLITE_DOCS_INDEX[satId];

  if (!sat) {
    return <Navigate to="/documentation/satellites" replace />;
  }

  const accent = sat.status === "active" ? "#6cc77b"
               : sat.status === "lost"   ? "#f39768"
               : "#9460b8";

  return (
    <div>
      <div style={{ marginBottom: 18, color: "var(--text-muted)", fontSize: 13 }}>
        <Link to="/documentation" style={{ color: "var(--accent-2)", textDecoration: "none" }}>
          ← Документация
        </Link>
        <span style={{ margin: "0 8px", opacity: 0.4 }}>/</span>
        <Link to="/documentation/satellites" style={{ color: "var(--accent-2)", textDecoration: "none" }}>
          Документация по спутникам
        </Link>
        <span style={{ margin: "0 8px", opacity: 0.4 }}>/</span>
        {sat.shortCode}
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <h1 className="page-title" style={{ margin: 0 }}>{sat.title}</h1>
        <span
          style={{
            fontSize: 11,
            padding: "3px 10px",
            borderRadius: 999,
            background: `${accent}18`,
            color: accent,
            border: `1px solid ${accent}55`,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: 700,
          }}
        >
          {sat.statusLabel}
        </span>
      </div>
      <p className="page-subtitle" style={{ marginBottom: 24 }}>{sat.subtitle}</p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 24 }}>
        <article style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {sat.image && (
            <img
              src={sat.image}
              alt={sat.title}
              style={{
                width: "100%",
                maxHeight: 360,
                objectFit: "cover",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "#0e0a1f",
              }}
            />
          )}

          {sat.sections.map((section) => (
            <section key={section.title} style={{ ...SECTION_CARD }}>
              <div style={SUBTITLE_STYLE}>{section.subtitle || "Раздел"}</div>
              <h2 style={{ margin: "0 0 12px", fontSize: 18, color: "var(--text)" }}>{section.title}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={i} style={{ margin: "0 0 10px", color: "var(--text-dim)", fontSize: 14, lineHeight: 1.7 }}>
                  {p}
                </p>
              ))}
              {section.bullets && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--text-dim)", fontSize: 14, lineHeight: 1.75 }}>
                  {section.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {sat.sources?.length > 0 && (
            <section style={{ ...SECTION_CARD }}>
              <div style={SUBTITLE_STYLE}>Источники</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--text-dim)" }}>
                {sat.sources.map((s, i) => (
                  <li key={i}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-2)" }}>
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>

        <aside style={{ ...SECTION_CARD, alignSelf: "flex-start", position: "sticky", top: 96 }}>
          <div style={SUBTITLE_STYLE}>Карточка</div>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            {sat.specs.map((s) => (
              <div key={s.key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <dt style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>
                  {s.key}
                </dt>
                <dd style={{ margin: 0, fontSize: 14, color: "var(--text)", fontWeight: 600 }}>
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}

/* ───────────────────────── layout ────────────────────────────── */

function SubNav() {
  const linkStyle = ({ isActive }) => ({
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    background: isActive ? "var(--surface-2)" : "transparent",
    color: isActive ? "var(--text)" : "var(--text-muted)",
    border: isActive ? "1px solid var(--border-hi, var(--border))" : "1px solid transparent",
  });
  return (
    <nav style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
      <NavLink to="/documentation" end style={linkStyle}>Обзор</NavLink>
      <NavLink to="/documentation/technical" style={linkStyle}>Техническая документация</NavLink>
      <NavLink to="/documentation/satellites" style={linkStyle}>Документация по спутникам</NavLink>
    </nav>
  );
}

export default function DocumentationPage() {
  return (
    <div className="page-wrap">
      <SubNav />
      <Routes>
        <Route index element={
          <>
            <div className="page-header-row">
              <div>
                <h1 className="page-title">Документация</h1>
                <p className="page-subtitle">
                  Технические руководства и описания каждого спутника серии Polytech Universe.
                </p>
              </div>
            </div>
            <DocOverview />
          </>
        } />
        <Route path="technical" element={<TechnicalDocs />} />
        <Route path="satellites" element={<SatellitesIndex />} />
        <Route path="satellites/:satId" element={<SatelliteDetail />} />
        <Route path="*" element={<Navigate to="/documentation" replace />} />
      </Routes>
    </div>
  );
}
