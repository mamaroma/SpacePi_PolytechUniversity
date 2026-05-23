from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class UserRole:
    READER = "reader"
    MODERATOR = "moderator"
    ADMIN = "admin"


ADMIN_EMAIL = "mrvelialman@gmail.com"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    role: str = Field(default=UserRole.READER)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)

    # ── Расширенный профиль (запрос Макарова) ───────────────────────
    # ФИО — обязательны для всех; патроним опционален.
    last_name: Optional[str] = Field(default=None)
    first_name: Optional[str] = Field(default=None)
    patronymic: Optional[str] = Field(default=None)

    # Абитуриент: школьник / лицеист / студент колледжа и т.п.
    # Для них активируется обязательное «учебное заведение» и автосогласие.
    is_applicant: bool = Field(default=False)
    school_name: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)

    # Согласие на обработку персональных данных (152-ФЗ).
    consent_personal_data: bool = Field(default=False)


class UserRead(SQLModel):
    id: int
    email: str
    role: str
    created_at: datetime
    is_active: bool

    last_name: Optional[str] = None
    first_name: Optional[str] = None
    patronymic: Optional[str] = None
    is_applicant: bool = False
    school_name: Optional[str] = None
    phone: Optional[str] = None
    consent_personal_data: bool = False


class UserRegister(SQLModel):
    email: str
    password: str
    # Обязательные ФИ; патроним опционален.
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    patronymic: Optional[str] = None
    is_applicant: bool = False
    school_name: Optional[str] = None
    phone: Optional[str] = None
    consent_personal_data: bool = False


class UserLogin(SQLModel):
    email: str
    password: str


class TokenResponse(SQLModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class RoleUpdate(SQLModel):
    role: str
