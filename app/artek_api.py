from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from .db import get_session
from .models import ArtekRegistration


router = APIRouter(prefix="/api/artek", tags=["artek"])

AIS_SIM_DIR = Path(__file__).resolve().parent.parent / "AIS_sim"
ALLOWED_FILES = {
    "README.txt",
    "Konkurs.docx",
    "main.py",
    "ais_map.py",
    "ARTEK_TASK.md",
    "competition_runner.py",
    "participant_decoder_template.py",
    "map_template.py",
}


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


@router.get("/files")
def list_artek_files() -> List[dict]:
    files = []
    for name in sorted(ALLOWED_FILES):
        p = AIS_SIM_DIR / name
        if p.exists() and p.is_file():
            files.append(
                {
                    "name": name,
                    "size_bytes": p.stat().st_size,
                    "download_url": f"/api/artek/files/{name}",
                }
            )
    return files


@router.get("/files/{filename}")
def download_artek_file(filename: str):
    if filename not in ALLOWED_FILES:
        raise HTTPException(status_code=404, detail="File not found")
    path = (AIS_SIM_DIR / filename).resolve()
    if AIS_SIM_DIR.resolve() not in path.parents and path != AIS_SIM_DIR.resolve():
        raise HTTPException(status_code=403, detail="Forbidden path")
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=filename, media_type="application/octet-stream")


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
