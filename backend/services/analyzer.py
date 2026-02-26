import pandas as pd
from pandas.api.types import is_numeric_dtype

def analyze_dataframe(df: pd.DataFrame):
    insights = []

    for col in df.columns:
        s = df[col]
        info = {
            "column": str(col),
            "dtype": str(s.dtype),
            "missing": int(s.isna().sum()),
        }

        if is_numeric_dtype(s):
            non_null = s.dropna()
            info["kind"] = "numeric"
            info["min"] = float(non_null.min()) if not non_null.empty else None
            info["max"] = float(non_null.max()) if not non_null.empty else None
            info["mean"] = float(non_null.mean()) if not non_null.empty else None
        else:
            info["kind"] = "text"
            # show top values
            vc = s.dropna().astype(str).value_counts().head(5)
            info["top_values"] = [{"value": k, "count": int(v)} for k, v in vc.items()]

        insights.append(info)

    return insights
