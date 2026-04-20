import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchNewsById } from "../api";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function NewsDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchNewsById(id)
      .then(setItem)
      .catch((e) => setError(e?.message || "Новость не найдена"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="app-body" style={{ textAlign: "center", padding: 80 }}>
        <span className="spinner" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="app-body">
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📰</div>
          <h2 style={{ color: "var(--text-dim)", marginBottom: 8 }}>Новость не найдена</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>{error}</p>
          <Link to="/" className="btn btn-primary">На главную</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app-body">
      <Link to="/" className="btn btn-sm" style={{ marginBottom: 16, display: "inline-flex" }}>
        ← Назад к новостям
      </Link>

      <article className="news-detail card">
        {item.image_url && (
          <div className="news-detail-image">
            <img
              src={item.image_url}
              alt={item.title}
              onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
            />
          </div>
        )}
        <div className="news-detail-body">
          <div className="news-card-date">{formatDate(item.created_at)}</div>
          <h1 className="news-detail-title">{item.title}</h1>
          <div className="news-detail-content">
            {(item.content || item.description).split("\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}
