import React from "react";

/** Маленькая всплывающая подсказка-кружок «?», объясняет куда кликать.
 *  <Hint text="..." /> — над элементом
 *  <Hint text="..." position="bottom" /> — под элементом */
export default function Hint({ text, position = "top" }) {
  return (
    <span
      className={`hint ${position === "bottom" ? "hint--bottom" : ""}`}
      data-hint={text}
      role="img"
      aria-label="подсказка"
    >
      ?
    </span>
  );
}

/** Большой ненавязчивый баннер-подсказка «как пользоваться» в начале страницы.
 *  Закрывается крестиком, состояние сохраняется в localStorage по ключу.
 *  Если ключ не передан — не сохраняется, просто скрывается на сессию. */
const INFO_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8" strokeWidth="3"/><line x1="12" y1="12" x2="12" y2="16"/>
  </svg>
);

export function GuideBanner({ id, icon, children }) {
  const displayIcon = icon === null ? null : (icon ?? INFO_ICON);
  const storageKey = id ? `polyspace.guide.${id}.dismissed` : null;
  const [hidden, setHidden] = React.useState(() => {
    if (!storageKey) return false;
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    if (storageKey) try { localStorage.setItem(storageKey, "1"); } catch {}
  };

  return (
    <div className="guide-banner">
      {displayIcon && <span className="guide-banner-icon">{displayIcon}</span>}
      <div style={{ flex: 1 }}>{children}</div>
      <button
        className="guide-banner-close"
        onClick={dismiss}
        title="Понятно, скрыть подсказку"
        aria-label="закрыть"
      >
        ×
      </button>
    </div>
  );
}
