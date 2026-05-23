from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel import Session, select

from .db import get_session
from .user_models import User, UserRead, UserRegister, UserLogin, TokenResponse, RoleUpdate, UserRole, ADMIN_EMAIL

SECRET_KEY = os.getenv("JWT_SECRET", "spacepi-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(user_id: int, email: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "email": email, "role": role, "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = _decode_token(credentials.credentials)
    user = session.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> Optional[User]:
    if not credentials:
        return None
    try:
        payload = _decode_token(credentials.credentials)
        return session.get(User, int(payload["sub"]))
    except HTTPException:
        return None


def require_roles(*roles: str):
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return _dep


require_editor = require_roles(UserRole.ADMIN, UserRole.MODERATOR)
require_admin = require_roles(UserRole.ADMIN)


@router.post("/register", response_model=TokenResponse)
def register(body: UserRegister, session: Session = Depends(get_session)):
    if session.exec(select(User).where(User.email == body.email)).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Согласие на обработку персональных данных обязательно.
    if not body.consent_personal_data:
        raise HTTPException(
            status_code=400,
            detail="Необходимо подтвердить согласие на обработку персональных данных",
        )

    # Обязательные поля профиля.
    last  = (body.last_name or "").strip()
    first = (body.first_name or "").strip()
    if not last or not first:
        raise HTTPException(
            status_code=400,
            detail="Фамилия и имя обязательны для регистрации",
        )

    # Абитуриентам — обязательное учебное заведение.
    if body.is_applicant:
        school = (body.school_name or "").strip()
        if not school:
            raise HTTPException(
                status_code=400,
                detail="Для абитуриентов укажите название учебного заведения",
            )
    else:
        school = (body.school_name or "").strip() or None

    role = UserRole.ADMIN if body.email == ADMIN_EMAIL else UserRole.READER

    # is_active:
    #   * админ — всегда активен;
    #   * абитуриент — активируется автоматически (его статус сам по себе
    #     подтверждение «настоящего человека»);
    #   * остальные — ждут ручной активации администратором.
    is_active = (role == UserRole.ADMIN) or bool(body.is_applicant)

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        role=role,
        is_active=is_active,
        last_name=last,
        first_name=first,
        patronymic=(body.patronymic or "").strip() or None,
        is_applicant=bool(body.is_applicant),
        school_name=school,
        phone=(body.phone or "").strip() or None,
        consent_personal_data=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Не-абитуриентам токен НЕ выдаём — учётка должна быть подтверждена админом.
    # Возвращаем 403 «pending approval»: фронт распознаёт по тексту и показывает
    # пользователю поздравление вместо ошибки.
    if not is_active:
        raise HTTPException(
            status_code=403,
            detail=(
                "PENDING_APPROVAL: Заявка принята. Учётная запись будет "
                "активирована администратором вручную — мы свяжемся с вами по email."
            ),
        )

    token = create_token(user.id, user.email, user.role)
    return TokenResponse(access_token=token, user=UserRead.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email)).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user.id, user.email, user.role)
    return TokenResponse(access_token=token, user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user


@router.get("/users", response_model=list[UserRead])
def list_users(
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    return session.exec(select(User).order_by(User.created_at)).all()


@router.patch("/users/{user_id}/role", response_model=UserRead)
def set_role(
    user_id: int,
    body: RoleUpdate,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    if body.role not in (UserRole.READER, UserRole.MODERATOR, UserRole.ADMIN):
        raise HTTPException(status_code=400, detail="Invalid role")

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    user.role = body.role
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
