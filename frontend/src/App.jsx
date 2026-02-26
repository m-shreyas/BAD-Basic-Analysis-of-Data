import { useMemo, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function bytesToMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

export default function App() {
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const fileMeta = useMemo(() => {
    if (!file) return null;
    return {
      name: file.name,
      sizeMB: bytesToMB(file.size),
      type: file.type || "unknown",
    };
  }, [file]);

  function resetAll() {
    setFile(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function validateFile(f) {
    if (!f) return "Please choose a file.";
    const name = (f.name || "").toLowerCase();
    const ok = name.endsWith(".csv") || name.endsWith(".xlsx");
    if (!ok) return "Only .csv or .xlsx files are supported.";
    if (f.size > 10 * 1024 * 1024) return "File too large. Max 10MB.";
    return "";
  }

  async function uploadFile(f) {
    setError("");
    setResult(null);

    const msg = validateFile(f);
    if (msg) {
      setError(msg);
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", f);

      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: form,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.detail || "Upload failed");

      setResult(json);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a file.");
      return;
    }
    await uploadFile(file);
  }

  async function loadSampleAndUpload() {
    try {
      resetAll();
      setError("");
      setBusy(true);

      const res = await fetch("/sample.csv", { cache: "no-store" });
      if (!res.ok) throw new Error("Sample file not found (sample.csv).");

      const blob = await res.blob();
      const sampleFile = new File([blob], "sample.csv", { type: "text/csv" });

      setFile(sampleFile);

      // auto-upload so user sees result immediately
      await uploadFile(sampleFile);
    } catch (err) {
      setError(err.message || "Failed to load sample dataset.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      {/* Header / Hero */}
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white font-bold text-lg">
                BAD
              </div>
              <div>
                <h1 className="text-2xl font-bold">
                  BAD{" "}
                  <span className="font-normal text-slate-500">
                    — Basic Analysis of Data
                  </span>
                </h1>
                <p className="text-sm text-slate-500">
                  Upload. Analyze. Download insights instantly.
                </p>
              </div>
            </div>

            <p className="max-w-2xl text-base text-slate-600">
              BAD helps you quickly clean datasets, explore column statistics, and
              generate professional PDF reports with charts — all in one click.
            </p>

            <div className="flex flex-wrap gap-3">
              <span className="rounded-full bg-slate-900 px-4 py-1 text-xs font-semibold text-white">
                CSV / XLSX Support
              </span>
              <span className="rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold text-slate-700">
                Auto Cleaning
              </span>
              <span className="rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold text-slate-700">
                PDF Reports + Charts
              </span>
              <span className="rounded-full bg-slate-100 px-4 py-1 text-xs font-semibold text-slate-700">
                No Login Required
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={loadSampleAndUpload}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={busy}
              >
                {busy ? "Loading sample…" : "Try with sample dataset"}
              </button>

              <div className="text-xs text-slate-500">
                🔒 Your data is processed locally and never stored permanently.
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Upload card */}
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">Upload a file</h2>
            <p className="mt-1 text-sm text-slate-500">
              Supported: <span className="font-medium">CSV</span>,{" "}
              <span className="font-medium">XLSX</span>. Max 10MB.
            </p>

            <form onSubmit={onUpload} className="mt-5 space-y-4">
              <div className="rounded-xl border border-dashed bg-slate-50 p-4">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => {
                    setError("");
                    setResult(null);
                    setFile(e.target.files?.[0] || null);
                  }}
                  className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800"
                />

                {fileMeta && (
                  <div className="mt-3 text-xs text-slate-600">
                    <div className="font-medium text-slate-800">
                      {fileMeta.name}
                    </div>
                    <div className="mt-1">
                      {fileMeta.sizeMB} MB • {fileMeta.type}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={!file || busy}
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Uploading…" : "Upload & Analyze"}
                </button>

                <button
                  type="button"
                  onClick={resetAll}
                  disabled={busy}
                  className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Reset
                </button>
              </div>
            </form>

            <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-semibold text-slate-800">What you get</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Cleaned Excel file (deduped, trimmed, empty rows removed)</li>
                <li>PDF report with column summary + charts</li>
              </ul>
            </div>
          </section>

          {/* Results card */}
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold">Results</h2>
            <p className="mt-1 text-sm text-slate-500">
              Downloads will appear after upload.
            </p>

            {!result ? (
              <div className="mt-6 grid place-items-center rounded-2xl border border-dashed p-10 text-center">
                <div className="text-sm text-slate-500">
                  No results yet. Upload a CSV/XLSX or click “Try with sample dataset”.
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-800">
                    Dataset summary
                  </div>
                  <div className="mt-2 text-sm text-slate-700">
                    Rows: <span className="font-semibold">{result.rows}</span> • Columns:{" "}
                    <span className="font-semibold">{result.cols}</span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <a
                    className="rounded-xl border bg-white p-4 hover:bg-slate-50"
                    href={`${API_URL}${result.cleanedFile}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="text-sm font-semibold">Download Cleaned Excel</div>
                    <div className="mt-1 text-xs text-slate-500">.xlsx output</div>
                  </a>

                  <a
                    className="rounded-xl border bg-white p-4 hover:bg-slate-50"
                    href={`${API_URL}${result.reportPdf}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="text-sm font-semibold">Download PDF Report</div>
                    <div className="mt-1 text-xs text-slate-500">Cover + summary + charts</div>
                  </a>
                </div>

                <button
                  onClick={resetAll}
                  className="w-full rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Upload another file
                </button>
              </div>
            )}
          </section>
        </div>

        <footer className="mt-10 text-center text-xs text-slate-500">
          BAD — Basic Analysis of Data • Built with React + FastAPI
        </footer>
      </main>
    </div>
  );
}
