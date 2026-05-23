import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

const fieldStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  fontSize: 14,
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  color: "var(--text-muted)",
  marginBottom: 6,
};

function Required() {
  return <span style={{ color: "var(--orange-2, #f39768)", marginLeft: 4 }}>*</span>;
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");

  // Общие поля
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Регистрационные поля
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [patronymic, setPatronymic] = useState("");
  const [phone, setPhone] = useState("");
  const [isApplicant, setIsApplicant] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [consent, setConsent] = useState(false);

  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (mode === "register") {
      if (!consent) {
        setError("Подтвердите согласие на обработку персональных данных.");
        return;
      }
      if (!lastName.trim() || !firstName.trim()) {
        setError("Фамилия и имя обязательны.");
        return;
      }
      if (isApplicant && !schoolName.trim()) {
        setError("Для абитуриентов укажите название учебного заведения.");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        navigate("/");
      } else {
        await register({
          email,
          password,
          last_name: lastName.trim(),
          first_name: firstName.trim(),
          patronymic: patronymic.trim() || null,
          is_applicant: isApplicant,
          school_name: schoolName.trim() || null,
          phone: phone.trim() || null,
          consent_personal_data: consent,
        });
        navigate("/");
      }
    } catch (err) {
      // Не-абитуриентов backend возвращает 403 с префиксом PENDING_APPROVAL —
      // это не настоящая ошибка, а уведомление о ручной модерации.
      const msg = err?.message || "Не удалось обработать запрос";
      if (/^PENDING_APPROVAL:/i.test(msg)) {
        setInfo(msg.replace(/^PENDING_APPROVAL:\s*/i, ""));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "24px 14px",
      }}
    >
      <div
        className="card"
        style={{ width: mode === "register" ? 520 : 380, maxWidth: "100%", padding: "32px 28px" }}
      >
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <img
            src="/spacepi-logo.svg"
            alt="PolySpace"
            style={{ height: 52, marginBottom: 10, display: "inline-block" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
          <h2 style={{ margin: 0, color: "var(--text)", fontSize: 20 }}>PolySpace</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
            {mode === "login" ? "Вход в систему" : "Регистрация"}
          </p>
        </div>

        {/* Mode switcher */}
        <div
          style={{
            display: "flex",
            background: "var(--surface-2)",
            borderRadius: 8,
            padding: 4,
            marginBottom: 22,
            gap: 4,
          }}
        >
          {["login", "register"].map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); setInfo(""); }}
              style={{
                flex: 1,
                padding: "8px 0",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                transition: "all .15s",
                background: mode === m ? "var(--accent)" : "transparent",
                color: mode === m ? "#fff" : "var(--text-muted)",
              }}
            >
              {m === "login" ? "Вход" : "Регистрация"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>
              Email{mode === "register" && <Required />}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>
              Пароль{mode === "register" && <Required />}
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={fieldStyle}
            />
          </div>

          {mode === "register" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Фамилия<Required /></label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Иванов"
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Имя<Required /></label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Иван"
                    style={fieldStyle}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Отчество <span style={{ opacity: 0.6 }}>(если есть)</span></label>
                  <input
                    type="text"
                    value={patronymic}
                    onChange={(e) => setPatronymic(e.target.value)}
                    placeholder="Иванович"
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Телефон <span style={{ opacity: 0.6 }}>(желательно)</span></label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 999 000-00-00"
                    style={fieldStyle}
                  />
                </div>
              </div>

              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  background: "var(--surface-1)",
                }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--text)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isApplicant}
                    onChange={(e) => setIsApplicant(e.target.checked)}
                    style={{ marginTop: 2, accentColor: "var(--accent, #9460b8)" }}
                  />
                  <span>
                    <strong>Я абитуриент</strong>{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      (школьник, лицеист, студент колледжа)
                    </span>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>
                      Учётные записи абитуриентов активируются автоматически.
                      Для прочих пользователей подтверждение проводится
                      администратором вручную.
                    </div>
                  </span>
                </label>

                {isApplicant && (
                  <div style={{ marginTop: 12 }}>
                    <label style={labelStyle}>
                      Учебное заведение<Required />
                    </label>
                    <input
                      type="text"
                      required={isApplicant}
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="Например: Президентский физико-математический лицей №239"
                      style={fieldStyle}
                    />
                  </div>
                )}
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text-dim)",
                  lineHeight: 1.5,
                  padding: "8px 4px",
                }}
              >
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  style={{ marginTop: 2, accentColor: "var(--orange, #f39768)" }}
                />
                <span>
                  Подтверждаю своё <strong>согласие на обработку персональных данных</strong>
                  {" "}в соответствии с Федеральным законом № 152-ФЗ
                  «О персональных данных». Я ознакомлен(а) с целями и сроком
                  обработки данных.
                </span>
              </label>
            </>
          )}

          {error && (
            <div
              style={{
                background: "rgba(218,73,39,0.14)",
                border: "1px solid rgba(218,73,39,0.4)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#da4927",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {info && (
            <div
              style={{
                background: "rgba(108,199,123,0.14)",
                border: "1px solid rgba(108,199,123,0.4)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#6cc77b",
                fontSize: 13,
              }}
            >
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ marginTop: 4, padding: "12px", fontSize: 14 }}
          >
            {loading ? "Загрузка…" : mode === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        {mode === "register" && (
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              textAlign: "center",
              marginTop: 14,
              lineHeight: 1.5,
            }}
          >
            После регистрации абитуриенты получают доступ сразу. Остальным
            учётка активируется администратором вручную.
          </p>
        )}
      </div>
    </div>
  );
}
