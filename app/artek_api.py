from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from .artek_engine import (
    create_session,
    decode_reference,
    extract_contest_description,
    extract_participant_instructions,
    input_to_csv,
    new_session_token,
    parse_answer_csv,
    score_submission,
)
from .db import get_session
from .models import ArtekChallengeSession, ArtekChallengeSubmission, ArtekRegistration


router = APIRouter(prefix="/api/artek", tags=["artek"])
logger = logging.getLogger(__name__)


class ArtekRegistrationIn(BaseModel):
    full_name: str = Field(min_length=5, max_length=200)
    birth_date: date
    school: str = Field(min_length=2, max_length=300)
    country: str = Field(min_length=2, max_length=120)
    email: EmailStr
    consent_personal_data: bool


class ArtekRegistrationOut(BaseModel):
    id: int
    created_at: datetime
    full_name: str
    school: str
    country: str
    email: EmailStr


class ChallengeSessionCreateIn(BaseModel):
    level: int = Field(ge=1, le=4)
    email: Optional[EmailStr] = None


class ChallengeSessionOut(BaseModel):
    session_id: str
    level: int
    packet_count: int
    input_preview: List[dict[str, str]]
    expected_format: str
    max_score: int


class ChallengeSubmitOut(BaseModel):
    submission_id: int
    session_id: str
    level: int
    score_total: float
    score_core: float
    score_bonus: float
    max_score: int
    matched: int
    reference_rows: int
    participant_rows: int
    used_custom_decoder: bool
    has_map_visualization: bool
    details: dict[str, Any]
    participant_points: List[dict[str, Any]]


LEVEL_FORMAT = {
    1: "mmsi[, name, type]",
    2: "mmsi, lat, lon, speed, last_seen",
    3: "mmsi, lat, lon, speed, last_seen",
    4: "mmsi, lat, lon, speed, last_seen",
}

LEVEL_MAX = {1: 15, 2: 25, 3: 40, 4: 40}

LEVEL_DESCRIPTIONS = {
    1: {
        "title": "Уровень 1 — Финский залив",
        "subtitle": "Синтаксический и статический контроль",
        "task": "Разберите поток AIVDM, отфильтруйте брак и определите валидные суда (MMSI, при возможности name/type).",
        "max_score": 15,
    },
    2: {
        "title": "Уровень 2 — Порт Приморск",
        "subtitle": "Анализ динамического трека",
        "task": "Восстановите маршрут одиночного судна, уберите координатные выбросы и приложите CSV + карту.",
        "max_score": 25,
    },
    3: {
        "title": "Уровень 3 — Панамский канал",
        "subtitle": "Диспетчерский срез",
        "task": "Сформируйте актуальную таблицу всех судов и предложите безопасные траектории.",
        "max_score": 40,
    },
    4: {
        "title": "Уровень 4 — Балтийское море",
        "subtitle": "Обнаружение GPS-спуфинга",
        "task": "Выделите истинные точки маршрутов и обозначьте зону спуфинга на карте.",
        "max_score": 40,
    },
}


@router.get("/instructions")
def get_instructions():
    return {
        "contest": extract_contest_description(),
        "participant": extract_participant_instructions(),
    }


@router.get("/levels")
def get_levels():
    return [
        {"level": lvl, **meta, "expected_format": LEVEL_FORMAT[lvl]}
        for lvl, meta in LEVEL_DESCRIPTIONS.items()
    ]


@router.post("/registrations", response_model=ArtekRegistrationOut)
def create_artek_registration(
    payload: ArtekRegistrationIn,
    session: Session = Depends(get_session),
):
    if not payload.consent_personal_data:
        raise HTTPException(status_code=400, detail="Consent is required")

    existing = session.exec(
        select(ArtekRegistration).where(ArtekRegistration.email == payload.email)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    row = ArtekRegistration(
        full_name=payload.full_name.strip(),
        birth_date=payload.birth_date,
        school=payload.school.strip(),
        country=payload.country.strip(),
        email=str(payload.email).strip().lower(),
        consent_personal_data=True,
        created_at=datetime.now(timezone.utc),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return ArtekRegistrationOut(
        id=row.id,
        created_at=row.created_at,
        full_name=row.full_name,
        school=row.school,
        country=row.country,
        email=row.email,
    )


@router.post("/challenges/session", response_model=ChallengeSessionOut)
def create_challenge_session(
    payload: ChallengeSessionCreateIn,
    session: Session = Depends(get_session),
):
    try:
        data = create_session(payload.level)
        row = ArtekChallengeSession(
            id=new_session_token(),
            level=payload.level,
            email=str(payload.email).lower() if payload.email else None,
            seed=data["seed"],
            input_json=json.dumps(data["input_rows"], ensure_ascii=False),
            reference_enc=data["reference_enc"],
            packet_count=data["packet_count"],
            created_at=datetime.now(timezone.utc),
        )
        session.add(row)
        session.commit()
        input_rows = json.loads(row.input_json)
        return ChallengeSessionOut(
            session_id=row.id,
            level=row.level,
            packet_count=row.packet_count,
            input_preview=input_rows[:8],
            expected_format=LEVEL_FORMAT[row.level],
            max_score=LEVEL_MAX[row.level],
        )
    except Exception as exc:
        logger.exception("Failed to create artek challenge session level=%s", payload.level)
        session.rollback()
        raise HTTPException(status_code=500, detail=f"Challenge session error: {exc}") from exc


@router.get("/challenges/session/{session_id}/input.csv")
def download_challenge_input(session_id: str, session: Session = Depends(get_session)):
    row = session.get(ArtekChallengeSession, session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    input_rows = json.loads(row.input_json)
    csv_text = input_to_csv(input_rows)
    return PlainTextResponse(
        csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="input_level{row.level}.csv"'},
    )


@router.get("/challenges/session/{session_id}/input")
def get_challenge_input(session_id: str, session: Session = Depends(get_session)):
    row = session.get(ArtekChallengeSession, session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    input_rows = json.loads(row.input_json)
    return {
        "session_id": row.id,
        "level": row.level,
        "packet_count": row.packet_count,
        "rows": input_rows,
        "expected_format": LEVEL_FORMAT[row.level],
    }


@router.post("/challenges/session/{session_id}/submit", response_model=ChallengeSubmitOut)
async def submit_challenge_answer(
    session_id: str,
    file: UploadFile = File(...),
    email: Optional[str] = Form(default=None),
    used_custom_decoder: bool = Form(default=False),
    has_map_visualization: bool = Form(default=False),
    session: Session = Depends(get_session),
):
    row = session.get(ArtekChallengeSession, session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    raw = await file.read()
    try:
        content = raw.decode("utf-8")
    except Exception:
        content = raw.decode("latin-1", errors="replace")

    participant = parse_answer_csv(content)
    if not participant:
        raise HTTPException(status_code=400, detail="Answer CSV is empty or invalid")

    reference = decode_reference(row.reference_enc)
    result = score_submission(
        row.level,
        reference,
        participant,
        used_custom_decoder=used_custom_decoder,
        has_map_visualization=has_map_visualization,
    )

    participant_points = []
    for p in participant:
        try:
            lat = float(p.get("lat", "")) if p.get("lat") not in (None, "") else None
            lon = float(p.get("lon", "")) if p.get("lon") not in (None, "") else None
        except Exception:
            lat, lon = None, None
        participant_points.append(
            {
                "mmsi": p.get("mmsi"),
                "lat": lat,
                "lon": lon,
                "speed": p.get("speed"),
                "last_seen": p.get("last_seen"),
                "name": p.get("name"),
                "type": p.get("type"),
            }
        )

    sub = ArtekChallengeSubmission(
        session_id=row.id,
        email=(email or row.email or "").lower() or None,
        answer_json=json.dumps(participant, ensure_ascii=False),
        score_core=result["core_score"],
        score_bonus=result["bonus_score"],
        score_total=result["total_score"],
        matched=result["matched"],
        reference_rows=result["reference_rows"],
        participant_rows=result["participant_rows"],
        details_json=json.dumps(result.get("details", {}), ensure_ascii=False),
        used_custom_decoder=used_custom_decoder,
        has_map_visualization=has_map_visualization,
        submitted_at=datetime.now(timezone.utc),
    )
    session.add(sub)
    session.commit()
    session.refresh(sub)

    return ChallengeSubmitOut(
        submission_id=sub.id,
        session_id=row.id,
        level=row.level,
        score_total=result["total_score"],
        score_core=result["core_score"],
        score_bonus=result["bonus_score"],
        max_score=result["max_score"],
        matched=result["matched"],
        reference_rows=result["reference_rows"],
        participant_rows=result["participant_rows"],
        used_custom_decoder=used_custom_decoder,
        has_map_visualization=has_map_visualization,
        details=result.get("details", {}),
        participant_points=participant_points,
    )
