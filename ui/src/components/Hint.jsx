import React, { useState, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";

const OFFSET = 10; // px between hint circle and tooltip

/** Вычисляем лучшую сторону: предпочитаем сверху, но если места нет — снизу */
function calcStyle(rect) {
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  const preferAbove = spaceAbove >= 120 || spaceAbove > spaceBelow;

  let top, arrowStyle;
  if (preferAbove) {
    top = rect.top + window.scrollY - OFFSET; // tooltip bottom = this value (via transform)
    arrowStyle = "above";
  } else {
    top = rect.bottom + window.scrollY + OFFSET;
    arrowStyle = "below";
  }

  // горизонталь: центрируем, но не выходим за экран
  let left = rect.left + rect.width / 2 + window.scrollX;
  return { top, left, arrowStyle, preferAbove };
}

/** Маленькая всплывающая подсказка-кружок «?», объясняет куда кликать.
 *  Tooltip рендерится через портал в body — никогда не обрезается overflow. */
export default function Hint({ text }) {
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState(null);
  const ref = useRef(null);
  const timerRef = useRef(null);

  const show = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setStyle(calcStyle(rect));
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
  }, []);

  // пересчёт при скролле пока открыт
  useLayoutEffect(() => {
    if (!visible) return;
    const onScroll = () => {
      if (ref.current) setStyle(calcStyle(ref.current.getBoundingClientRect()));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [visible]);

  const tooltip = visible && style ? createPortal(
    <div
      className={`hint-portal-tooltip ${style.arrowStyle === "above" ? "hint-portal--above" : "hint-portal--below"}`}
      style={{
        left: style.left,
        top: style.top,
      }}
    >
      {text}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <span
        ref={ref}
        className="hint"
        onMouseEnter={show}
        onFocus={show}
        onMouseLeave={hide}
        onBlur={hide}
        role="img"
        aria-label="подсказка"
        tabIndex={0}
      >
        ?
      </span>
      {tooltip}
    </>
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
