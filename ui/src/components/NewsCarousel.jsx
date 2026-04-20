import React, { useState, useCallback } from "react";

export default function NewsCarousel({ images = [], compact = false }) {
  const [idx, setIdx] = useState(0);

  const prev = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const next = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => (i + 1) % images.length);
  }, [images.length]);

  if (!images.length) return null;

  const single = images.length === 1;

  return (
    <div className={`carousel ${compact ? "carousel--compact" : "carousel--full"}`}>
      <img
        key={images[idx]}
        src={images[idx]}
        alt={`Фото ${idx + 1}`}
        className="carousel__img"
        onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
      />

      {!single && (
        <>
          <button className="carousel__btn carousel__btn--prev" onClick={prev} aria-label="Предыдущее фото">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <button className="carousel__btn carousel__btn--next" onClick={next} aria-label="Следующее фото">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
          <div className="carousel__dots">
            {images.map((_, i) => (
              <button
                key={i}
                className={`carousel__dot${i === idx ? " carousel__dot--active" : ""}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx(i); }}
                aria-label={`Фото ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
