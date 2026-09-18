import React, { useState } from "react";

const CONTACT_EMAIL = "spacepicontest@mail.ru";
const CONTACT_TG = "encrypted_eleven";
const CONTACT_VK = "https://vk.ru/kaoiii";

/* darkBg: логотипы со светлыми цветами — показываем на тёмном фоне (наш зелёный).
   lightBg: логотипы с тёмными/чёрными цветами — показываем на белом прямоугольнике. */
const PARTNERS = [
  {
    name: "Политех СПб",
    role: "СПбПУ Петра Великого",
    logo: "/polytech-logo.svg",
    bg: "light",
    href: "https://www.spbstu.ru/",
  },
  {
    name: "Space-π",
    role: "Научно-образовательный проект",
    logo: "/spacepi-logo.svg",
    bg: "dark",
    href: "https://spacepi.space/",
  },
  {
    name: "ФСИ",
    role: "Фонд содействия инновациям",
    logo: "/fsi-logo.png",
    bg: "light",
    href: "https://fasie.ru/",
  },
  {
    name: "Роскосмос",
    role: "Госкорпорация",
    logo: "/roscosmos-logo.png",
    bg: "light",
    href: "https://www.roscosmos.ru/",
  },
  {
    name: "ВШПФиКТ",
    role: "Высшая школа прикладной физики и космических технологий",
    logo: "/ieit-logo.png",
    bg: "light",
    href: "https://et.spbstu.ru/",
  },
];

function PartnerCard({ p }) {
  return (
    <a
      className="partner-card"
      href={p.href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${p.name} — ${p.role}`}
    >
      <div className={`partner-logo-img-wrap partner-logo-img-wrap--${p.bg}`}>
        <img
          src={p.logo}
          alt={p.name}
          className="partner-logo-img"
          loading="lazy"
        />
      </div>
      <div className="partner-name">{p.name}</div>
      <div className="partner-role">{p.role}</div>
    </a>
  );
}

function ContactsBlock() {
  return (
    <div className="contacts-block">
      <h3>Связаться с нами</h3>
      <p>
        Вопросы, идеи или предложения о сотрудничестве — пишите напрямую.
        Отвечаем быстро.
      </p>
      <div className="contact-buttons">
        <a
          className="contact-btn contact-btn--email"
          href={`mailto:${CONTACT_EMAIL}`}
        >
          <span className="contact-btn-icon" aria-hidden="true">✉</span>
          <span className="contact-btn-label">
            <span className="small">Email</span>
            <span className="big">{CONTACT_EMAIL}</span>
          </span>
        </a>
        <a
          className="contact-btn contact-btn--telegram"
          href={`https://t.me/${CONTACT_TG}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="contact-btn-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21.5 4.2 18.4 19.8c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.3 13.5l-4.9-1.5c-1.1-.3-1.1-1 .2-1.5l19-7.3c.9-.3 1.7.2 1.4 1Z" fill="#1a3220"/>
            </svg>
          </span>
          <span className="contact-btn-label">
            <span className="small">Telegram</span>
            <span className="big">@{CONTACT_TG}</span>
          </span>
        </a>
        <a
          className="contact-btn contact-btn--vk"
          href={CONTACT_VK}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="contact-btn-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.8 17.5c-5.6 0-8.8-3.8-8.9-10.2h2.8c.1 4.7 2.2 6.7 3.8 7.1V7.3h2.6v4.1c1.6-.2 3.3-2 3.8-4.1h2.6c-.4 2.4-2.2 4.2-3.5 4.9 1.3.6 3.4 2.2 4.2 5.3h-2.9c-.6-1.9-2.2-3.4-4.2-3.6v3.6h-.3Z" fill="#1a3220"/>
            </svg>
          </span>
          <span className="contact-btn-label">
            <span className="small">ВКонтакте</span>
            <span className="big">vk.ru/kaoiii</span>
          </span>
        </a>
      </div>
    </div>
  );
}

function FeedbackForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const subject = encodeURIComponent(
      `[PolySpace] Обратная связь${name ? ` от ${name}` : ""}`
    );
    const body = encodeURIComponent(
      `Имя: ${name}\nEmail: ${email}\n\n${message}`
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true);
    setTimeout(() => setSent(false), 6000);
  };

  return (
    <form className="feedback-form" onSubmit={submit}>
      <h3>Обратная связь</h3>
      <div className="form-row">
        <input
          type="text"
          placeholder="Ваше имя"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <textarea
        placeholder="Расскажите, чем мы можем помочь…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
      />
      <button type="submit" className="send-btn">Отправить →</button>
      {sent && (
        <div className="sent-msg">
          ✓ Открыли клиент почты — отправьте сообщение, чтобы оно дошло.
        </div>
      )}
    </form>
  );
}

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <div className="footer-section-title">Партнёры проекта</div>
          <div className="partners-grid">
            {PARTNERS.map((p) => (
              <PartnerCard key={p.name} p={p} />
            ))}
          </div>
        </div>

        <div>
          <div className="footer-section-title">Контакты и обратная связь</div>
          <div className="contacts-grid">
            <ContactsBlock />
            <FeedbackForm />
          </div>
        </div>

        <div className="footer-bottom">
          <span>PolySpace Ground Station · Polytech University · СПбПУ</span>
          <span style={{ marginLeft: "auto" }}>© {new Date().getFullYear()} PolySpace</span>
        </div>
      </div>
    </footer>
  );
}
