from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta, timezone
from pathlib import Path
import uuid
import os

from backend.services.cleaner import load_and_clean
from backend.services.analyzer import analyze_dataframe
from backend.services.report import generate_pdf_report

# ─── Config ────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-use-a-long-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bad.db")

# ─── Database ──────────────────────────────────────────────────────────────
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    files = relationship("UploadedFile", back_populates="user", cascade="all, delete")


class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    filename = Column(String, nullable=False)
    rows = Column(Integer)
    cols = Column(Integer)
    cleaned_path = Column(Text)
    report_path = Column(Text)
    columns_json = Column(Text)  # JSON-serialised insights
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    user = relationship("User", back_populates="files")


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Auth helpers ──────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User | None:
    """Returns user if token is valid, None if no token (allows anonymous uploads)."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
    return db.query(User).filter(User.id == user_id).first()


def require_user(current_user: User | None = Depends(get_current_user)) -> User:
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return current_user


# ─── Pydantic schemas ─────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    name: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class FileHistoryItem(BaseModel):
    id: str
    filename: str
    rows: int | None
    cols: int | None
    cleaned_path: str | None
    report_path: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# ─── App ──────────────────────────────────────────────────────────────────
app = FastAPI(title="BAD — Basic Analysis of Data")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
DATA_DIR.mkdir(exist_ok=True)


# ─── Health ───────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok"}


# ─── Auth Routes ──────────────────────────────────────────────────────────
@app.post("/auth/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=req.email,
        name=req.name,
        hashed_password=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token)


@app.post("/auth/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token)


@app.get("/auth/me", response_model=UserOut)
def me(current_user: User = Depends(require_user)):
    return current_user


# ─── Upload ───────────────────────────────────────────────────────────────
@app.post("/upload")
async def upload(
    file: UploadFile = File(...),
    current_user: User | None = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    name = file.filename.lower()
    if not (name.endswith(".csv") or name.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Only CSV or XLSX files are supported")

    uid = uuid.uuid4().hex
    input_path = DATA_DIR / f"{uid}_{file.filename}"

    with open(input_path, "wb") as f:
        f.write(await file.read())

    try:
        df = load_and_clean(input_path)
        insights = analyze_dataframe(df)
        preview = df.head(10).fillna("").to_dict(orient="records")

        excel_path = DATA_DIR / f"{uid}_cleaned.xlsx"
        df.to_excel(excel_path, index=False)

        pdf_path = DATA_DIR / f"{uid}_report.pdf"
        generate_pdf_report(df, insights, pdf_path, meta={"filename": file.filename})

        # Save to DB if user is authenticated
        if current_user:
            import json
            record = UploadedFile(
                user_id=current_user.id,
                filename=file.filename,
                rows=int(df.shape[0]),
                cols=int(df.shape[1]),
                cleaned_path=f"/download/{excel_path.name}",
                report_path=f"/download/{pdf_path.name}",
                columns_json=json.dumps(insights),
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            file_id = record.id
        else:
            file_id = uid

        return {
            "id": file_id,
            "rows": int(df.shape[0]),
            "cols": int(df.shape[1]),
            "preview": preview,
            "columns": insights,
            "cleanedFile": f"/download/{excel_path.name}",
            "reportPdf": f"/download/{pdf_path.name}",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Clean up raw input file
        try:
            input_path.unlink(missing_ok=True)
        except Exception:
            pass


# ─── File History ─────────────────────────────────────────────────────────
@app.get("/files/history")
def file_history(
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    import json
    records = (
        db.query(UploadedFile)
        .filter(UploadedFile.user_id == current_user.id)
        .order_by(UploadedFile.created_at.desc())
        .limit(20)
        .all()
    )
    result = []
    for r in records:
        item = {
            "id": r.id,
            "filename": r.filename,
            "rows": r.rows,
            "cols": r.cols,
            "cleanedFile": r.cleaned_path,
            "reportPdf": r.report_path,
            "created_at": r.created_at.isoformat(),
        }
        if r.columns_json:
            try:
                item["columns"] = json.loads(r.columns_json)
            except Exception:
                item["columns"] = []
        result.append(item)
    return result


@app.delete("/files/{file_id}")
def delete_file(
    file_id: str,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    record = db.query(UploadedFile).filter(
        UploadedFile.id == file_id,
        UploadedFile.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    db.delete(record)
    db.commit()
    return {"ok": True}


# ─── Download ─────────────────────────────────────────────────────────────
@app.get("/download/{filename}")
def download(filename: str):
    # Prevent path traversal
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    file_path = DATA_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return StreamingResponse(
        open(file_path, "rb"),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )