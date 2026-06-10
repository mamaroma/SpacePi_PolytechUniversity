import React from "react";
import { ADMIN_MEMBERS, TEAM_MEMBERS } from "../data/teamMembers";

function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] || "?").toUpperCase();
}

function PersonPhoto({ person, variant = "team" }) {
  if (person.photo) {
    return (
      <div className={`creators-photo creators-photo--${variant}`}>
        <img src={person.photo} alt={person.name} loading="lazy" />
      </div>
    );
  }

  return (
    <div
      className={`creators-photo creators-photo--${variant} creators-photo--placeholder`}
      style={{ "--person-accent": person.accent }}
    >
      <span>{initials(person.name)}</span>
      <div className="creators-photo-badge">фото скоро</div>
    </div>
  );
}

function AdminCard({ person }) {
  return (
    <article
      className="creators-admin-card"
      style={{ "--person-accent": person.accent }}
    >
      <PersonPhoto person={person} variant="admin" />
      <div className="creators-card-body">
        <h3 className="creators-card-name">{person.name}</h3>
        <ul className="creators-card-roles">
          {person.roles.map((role) => (
            <li key={role}>{role}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function TeamCard({ person }) {
  return (
    <article
      className="creators-team-card"
      style={{ "--person-accent": person.accent }}
    >
      <PersonPhoto person={person} variant="team" />
      <div className="creators-card-body">
        <h3 className="creators-card-name">{person.name}</h3>
        <ul className="creators-card-roles">
          {person.roles.map((role) => (
            <li key={role}>{role}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export default function CreatorsPage() {
  return (
    <div className="app-body creators-page">
      <header className="creators-hero">
        <div className="creators-hero-text">
          <p className="creators-eyebrow">PolySpace</p>
          <h1 className="page-title creators-title">Создатели</h1>
          <p className="page-subtitle creators-subtitle">
            Люди, которые развивают наземную станцию, спутниковые данные
            и образовательную платформу проекта.
          </p>
        </div>
      </header>

      <section className="creators-section creators-section--admin">
        <div className="creators-section-head">
          <h2 className="creators-section-title">Администрация</h2>
          <p className="creators-section-desc">
            Руководство СПбПУ, курирующее институт и высшую школу проекта.
          </p>
        </div>
        <div className="creators-admin-grid">
          {ADMIN_MEMBERS.map((person) => (
            <AdminCard key={person.id} person={person} />
          ))}
        </div>
      </section>

      <section className="creators-section creators-section--team">
        <div className="creators-section-head">
          <h2 className="creators-section-title">Состав команды</h2>
          <p className="creators-section-desc">
            Научное руководство, конструкторский блок и разработка PolySpace.
          </p>
        </div>
        <div className="creators-team-grid">
          {TEAM_MEMBERS.map((person) => (
            <TeamCard key={person.id} person={person} />
          ))}
        </div>
      </section>
    </div>
  );
}
