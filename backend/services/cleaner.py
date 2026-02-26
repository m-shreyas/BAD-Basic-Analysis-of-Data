import pandas as pd
from pathlib import Path

def load_and_clean(path: Path):
    path = Path(path)
    name = path.name.lower()

    # Load
    if name.endswith(".csv"):
        df = pd.read_csv(path)
    elif name.endswith(".xlsx"):
        df = pd.read_excel(path)
    else:
        raise ValueError("Unsupported file type. Upload .csv or .xlsx")

    # Clean basics
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]

    # Trim strings safely
    for col in df.columns:
        if df[col].dtype == "object":
            df[col] = df[col].astype(str).str.strip()

    # Drop fully empty rows
    df = df.dropna(how="all")

    # Drop duplicates
    df = df.drop_duplicates()

    return df
