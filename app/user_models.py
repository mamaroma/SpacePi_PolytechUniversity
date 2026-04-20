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


class UserRead(SQLModel):
    id: int
    email: str
    role: str
    created_at: datetime
    is_active: bool


class UserRegister(SQLModel):
    email: str
    password: str


class UserLogin(SQLModel):
    email: str
    password: str


class TokenResponse(SQLModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class RoleUpdate(SQLModel):
    role: str
