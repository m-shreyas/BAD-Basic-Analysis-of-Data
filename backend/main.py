from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pathlib import Path
import uuid

from backend.services.cleaner import load_and_clean
from backend.services.analyzer import analyze_dataframe
from backend.services.report import generate_pdf_report

app = FastAPI(title="Auto Data Analyzer")

# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Paths ----------
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# ---------- Health ----------
@app.get("/health")
def health():
    return {"status": "ok"}

# ---------- Upload ----------
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    name = file.filename.lower()
    if not (name.endswith(".csv") or name.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Only CSV or XLSX files are supported")

    uid = uuid.uuid4().hex
    input_path = DATA_DIR / f"{uid}_{file.filename}"

    # Save uploaded file
    with open(input_path, "wb") as f:
        f.write(await file.read())

    try:
        # Clean + load
        df = load_and_clean(input_path)

        # Analyze
        insights = analyze_dataframe(df)

        # Preview (first 10 rows)
        preview = df.head(10).fillna("").to_dict(orient="records")

        # Save cleaned Excel
        excel_path = DATA_DIR / f"{uid}_cleaned.xlsx"
        df.to_excel(excel_path, index=False)

        # Generate PDF
        pdf_path = DATA_DIR / f"{uid}_report.pdf"
        generate_pdf_report(
    df,
    insights,
    pdf_path,
    meta={"filename": file.filename}
)


        return {
            "rows": int(df.shape[0]),
            "cols": int(df.shape[1]),
            "preview": preview,
            "columns": insights,
            "cleanedFile": f"/download/{excel_path.name}",
            "reportPdf": f"/download/{pdf_path.name}",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Download ----------
@app.get("/download/{filename}")
def download(filename: str):
    file_path = DATA_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return StreamingResponse(
        open(file_path, "rb"),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
