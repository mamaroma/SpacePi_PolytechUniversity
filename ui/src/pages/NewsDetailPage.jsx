import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchNewsById, trackNewsView } from "../api";
import NewsCarousel from "../components/NewsCarousel";

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
      .then((data) => {
        setItem(data);
        trackNewsView(id);
      })
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

  const images = item.images?.length ? item.images : (item.image_url ? [item.image_url] : []);

  return (
    <div className="app-body">
      <Link to="/" className="btn btn-sm" style={{ marginBottom: 16, display: "inline-flex" }}>
        ← Назад к новостям
      </Link>

      <article className="news-detail card">
        {images.length > 0 && (
          <NewsCarousel images={images} compact={false} />
        )}
        <div className="news-detail-body">
          <div className="news-detail-meta">
            <span className="news-card-date">{formatDate(item.created_at)}</span>
            {item.views > 0 && (
              <span className="news-views">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                {item.views}
              </span>
            )}
          </div>
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
