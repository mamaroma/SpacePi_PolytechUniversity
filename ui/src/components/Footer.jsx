import React, { useState } from "react";

const PARTNERS = [
  {
    name: "Политех СПб",
    role: "СПбПУ Петра Великого",
    logoText: "ПОЛИ",
    logoVariant: "",
    href: "https://www.spbstu.ru/",
  },
  {
    name: "SpacePi",
    role: "Лаборатория",
    logoText: "Sπ",
    logoVariant: "mix",
    href: "https://spacepi.ru/",
  },
  {
    name: "ФСИ",
    role: "Фонд содействия инновациям",
    logoText: "ФСИ",
    logoVariant: "orange",
    href: "https://fasie.ru/",
  },
  {
    name: "Роскосмос",
    role: "Госкорпорация",
    logoText: "🚀",
    logoVariant: "orange",
    href: "https://www.roscosmos.ru/",
  },
  {
    name: "ИЭиТ",
    role: "ВШПФиКТ · СПбПУ",
    logoText: "ИЭ",
    logoVariant: "",
    href: "https://www.spbstu.ru/structure/institut_energetiki_i_transportnyh_sistem/",
  },
];

function PartnerCard({ p }) {
  const variantClass =
    p.logoVariant === "orange" ? "partner-logo--orange" :
    p.logoVariant === "mix"    ? "partner-logo--mix"    : "";
  return (
    <a
      className="partner-card"
      href={p.href}
      target="_blank"
      rel="noopener noreferrer"
      title={`${p.name} — ${p.role}`}
    >
      <div className={`partner-logo ${variantClass}`}>{p.logoText}</div>
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
          href="mailto:mrvelialman@gmail.com"
        >
          <span className="contact-btn-icon" aria-hidden="true">✉</span>
          <span className="contact-btn-label">
            <span className="small">Email</span>
            <span className="big">mrvelialman@gmail.com</span>
          </span>
        </a>
        <a
          className="contact-btn contact-btn--telegram"
          href="https://t.me/roosterwq"
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
            <span className="big">@roosterwq</span>
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
    window.location.href = `mailto:mrvelialman@gmail.com?subject=${subject}&body=${body}`;
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
          <span>PolySpace Ground Station · Polytech University</span>
          <span style={{ marginLeft: "auto" }}>
            API: <a href="/docs" target="_blank" rel="noreferrer">/docs</a>
          </span>
          <span>© {new Date().getFullYear()} PolySpace</span>
        </div>
      </div>
    </footer>
  );
}
