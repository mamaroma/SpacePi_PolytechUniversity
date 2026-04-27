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
export function GuideBanner({ id, icon = "💡", children }) {
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
      <span className="guide-banner-icon">{icon}</span>
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
