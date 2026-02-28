import { useMemo, useRef, useState, useEffect, createContext, useContext } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const AuthContext = createContext(null);
function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bad_user")); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem("bad_token") || null);
  function login(userData, tok) {
    setUser(userData); setToken(tok);
    localStorage.setItem("bad_user", JSON.stringify(userData));
    localStorage.setItem("bad_token", tok);
  }
  function logout() {
    setUser(null); setToken(null);
    localStorage.removeItem("bad_user");
    localStorage.removeItem("bad_token");
  }
  return <AuthContext.Provider value={{ user, token, login, logout }}>{children}</AuthContext.Provider>;
}

function bytesToMB(b) { return (b / (1024 * 1024)).toFixed(2); }
const CHART_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onSwitch, mode }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login"
        ? new URLSearchParams({ username: form.email, password: form.password })
        : JSON.stringify({ email: form.email, password: form.password, name: form.name });
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: mode === "login"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : { "Content-Type": "application/json" },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Auth failed");
      login({ email: form.email, name: form.name || form.email.split("@")[0] }, data.access_token);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="fixed inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)",
        backgroundSize: "60px 60px"
      }} />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-black text-white text-sm">BAD</div>
            <span className="text-white font-semibold text-xl tracking-tight">Basic Analysis of Data</span>
          </div>
          <p className="text-zinc-500 text-sm">Upload. Analyze. Understand.</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-white font-bold text-2xl mb-1">{mode === "login" ? "Welcome back" : "Create account"}</h2>
          <p className="text-zinc-500 text-sm mb-7">{mode === "login" ? "Sign in to access your analyses" : "Start analyzing your data for free"}</p>
          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-zinc-400 text-xs font-medium mb-1.5 block">Full Name</label>
                <input className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-zinc-600"
                  placeholder="Your name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            )}
            <div>
              <label className="text-zinc-400 text-xs font-medium mb-1.5 block">Email</label>
              <input type="email" required className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-zinc-600"
                placeholder="you@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="text-zinc-400 text-xs font-medium mb-1.5 block">Password</label>
              <input type="password" required className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-zinc-600"
                placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">{error}</div>}
            <button type="submit" disabled={busy} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 rounded-xl text-sm transition-all disabled:opacity-50 mt-2">
              {busy ? "Please wait…" : (mode === "login" ? "Sign in" : "Create account")}
            </button>
          </form>
          <p className="text-center text-zinc-500 text-sm mt-6">
            {mode === "login" ? "No account yet? " : "Already have an account? "}
            <button onClick={onSwitch} className="text-indigo-400 hover:text-indigo-300 font-medium">{mode === "login" ? "Register" : "Sign in"}</button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Charts (uses backend field names: column, kind, missing, mean, min, max) ──
function NullChart({ columns = [] }) {
  const data = columns.slice(0, 10).map(c => ({
    name: (c.column || "").slice(0, 12),
    nulls: c.missing || 0,
    filled: 10 - (c.missing || 0),
  }));
  if (!data.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-1">Completeness</h3>
      <p className="text-zinc-500 text-xs mb-4">Filled vs. missing values per column</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} angle={-35} textAnchor="end" />
          <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, color: "#fff" }} />
          <Bar dataKey="filled" stackId="a" fill="#6366f1" radius={[0,0,0,0]} name="Filled" />
          <Bar dataKey="nulls" stackId="a" fill="#ef4444" radius={[4,4,0,0]} name="Missing" />
          <Legend wrapperStyle={{ color: "#71717a", fontSize: 12, paddingTop: 8 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TypesPieChart({ columns = [] }) {
  const typeCounts = columns.reduce((acc, c) => {
    const t = c.kind || "other";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const data = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));
  if (!data.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-1">Column Types</h3>
      <p className="text-zinc-500 text-xs mb-4">Distribution of data types</p>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, color: "#fff" }} />
          <Legend wrapperStyle={{ color: "#71717a", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function NumericStatsChart({ columns = [] }) {
  const numCols = columns.filter(c => c.kind === "numeric").slice(0, 8);
  if (!numCols.length) return null;
  const data = numCols.map(c => ({
    name: (c.column || "").slice(0, 10),
    mean: parseFloat((c.mean ?? 0).toFixed(2)),
    min: parseFloat((c.min ?? 0).toFixed(2)),
    max: parseFloat((c.max ?? 0).toFixed(2)),
  }));
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-1">Numeric Statistics</h3>
      <p className="text-zinc-500 text-xs mb-4">Mean, min & max per numeric column</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} angle={-35} textAnchor="end" />
          <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, color: "#fff" }} />
          <Bar dataKey="mean" fill="#6366f1" radius={[3,3,0,0]} name="Mean" />
          <Bar dataKey="min" fill="#06b6d4" radius={[3,3,0,0]} name="Min" />
          <Bar dataKey="max" fill="#f59e0b" radius={[3,3,0,0]} name="Max" />
          <Legend wrapperStyle={{ color: "#71717a", fontSize: 12, paddingTop: 8 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function UniquenessChart({ columns = [] }) {
  const data = columns.slice(0, 10).map(c => ({
    name: (c.column || "").slice(0, 12),
    unique: c.top_values?.length || 0,
  }));
  if (!data.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-1">Top Value Counts</h3>
      <p className="text-zinc-500 text-xs mb-4">Distinct values found per column</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} angle={-35} textAnchor="end" />
          <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, color: "#fff" }} />
          <Bar dataKey="unique" fill="#10b981" radius={[4,4,0,0]} name="Top Values" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Column Stats Table ───────────────────────────────────────────────────────
function ColumnTable({ columns = [] }) {
  const [search, setSearch] = useState("");
  const filtered = columns.filter(c => (c.column || "").toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-white font-semibold text-sm">Column Statistics</h3>
          <p className="text-zinc-500 text-xs mt-0.5">Detailed per-column breakdown</p>
        </div>
        <input className="bg-zinc-800 border border-zinc-700 text-white text-sm px-3 py-1.5 rounded-lg placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
          placeholder="Filter columns…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="overflow-x-auto max-w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              {["Column","Type","Kind","Missing","Mean","Min","Max"].map(h => (
                <th key={h} className="text-left text-zinc-500 font-medium text-xs py-2 px-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="py-2.5 px-3 text-white font-medium">{c.column}</td>
                <td className="py-2.5 px-3"><span className="bg-indigo-500/10 text-indigo-400 text-xs px-2 py-0.5 rounded-full">{c.dtype || "—"}</span></td>
                <td className="py-2.5 px-3 text-zinc-400">{c.kind || "—"}</td>
                <td className="py-2.5 px-3"><span className={c.missing > 0 ? "text-red-400" : "text-zinc-500"}>{c.missing ?? "—"}</span></td>
                <td className="py-2.5 px-3 text-zinc-400">{c.mean != null ? c.mean.toFixed(2) : "—"}</td>
                <td className="py-2.5 px-3 text-zinc-400">{c.min != null ? c.min : "—"}</td>
                <td className="py-2.5 px-3 text-zinc-400">{c.max != null ? c.max : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Data Preview Table ───────────────────────────────────────────────────────
function PreviewTable({ preview }) {
  if (!preview?.length) return null;
  const cols = Object.keys(preview[0]);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-1">Data Preview</h3>
      <p className="text-zinc-500 text-xs mb-4">First 10 rows of cleaned data</p>
      <div style={{ maxWidth: 'calc(100vw - 380px)', overflowX: 'auto' }}>
        <table className="text-xs" style={{ minWidth: 'max-content' }}>
          <thead>
            <tr className="border-b border-zinc-800">
              {cols.map(c => <th key={c} className="text-left text-zinc-500 font-medium py-2 px-3 whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                {cols.map(c => <td key={c} className="py-2 px-3 text-zinc-300 whitespace-nowrap max-w-[160px] truncate">{String(row[c] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── History Sidebar ──────────────────────────────────────────────────────────
function HistorySidebar({ history, onSelect, selectedId }) {
  if (!history?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 h-fit">
      <h3 className="text-white font-semibold text-sm mb-4">Recent Uploads</h3>
      <div className="space-y-2">
        {history.map(h => (
          <button key={h.id} onClick={() => onSelect(h)}
            className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${selectedId === h.id ? "bg-indigo-500/20 border border-indigo-500/30" : "hover:bg-zinc-800 border border-transparent"}`}>
            <div className="text-white text-xs font-medium truncate">{h.filename}</div>
            <div className="text-zinc-500 text-xs mt-0.5">{h.rows} rows · {h.cols} cols</div>
            <div className="text-zinc-600 text-xs">{new Date(h.created_at).toLocaleDateString()}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const { user, token, logout } = useAuth();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const fileMeta = useMemo(() => file ? { name: file.name, sizeMB: bytesToMB(file.size) } : null, [file]);

  useEffect(() => { fetchHistory(); }, []);

  async function fetchHistory() {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/files/history`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setHistory(await res.json());
    } catch {}
  }

  function resetAll() {
    setFile(null); setResult(null); setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadFile(f) {
    setError(""); setResult(null);
    if (!f) return setError("Choose a file.");
    const name = (f.name || "").toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) return setError("Only .csv or .xlsx supported.");
    if (f.size > 10 * 1024 * 1024) return setError("Max file size is 10MB.");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Upload failed");
      setResult(json);
      setActiveTab("overview");
      fetchHistory();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const columns = result?.columns || [];
  const numericCols = columns.filter(c => c.kind === "numeric");

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      <div className="fixed inset-0 opacity-[0.025]" style={{
        backgroundImage: "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)",
        backgroundSize: "60px 60px"
      }} />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

      <nav className="relative border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-black text-white text-xs">BAD</div>
            <span className="font-semibold text-sm tracking-tight">Basic Analysis of Data</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-zinc-400 text-sm">Hey, {user?.name || user?.email}</span>
            <button onClick={logout} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">Sign out</button>
          </div>
        </div>
      </nav>

<div className="relative max-w-7xl mx-auto px-6 py-8 overflow-x-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-4">

          {/* Sidebar */}
          <div className="space-y-4 min-w-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h2 className="text-white font-semibold text-sm mb-1">Upload Dataset</h2>
              <p className="text-zinc-500 text-xs mb-4">CSV or XLSX · Max 10MB</p>
              <div
                className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${dragOver ? "border-indigo-500 bg-indigo-500/5" : "border-zinc-700 hover:border-zinc-600"}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setError(""); setResult(null); } }}
                onClick={() => inputRef.current?.click()}
              >
                <div className="text-3xl mb-2">📂</div>
                <p className="text-zinc-400 text-xs">
                  {fileMeta ? <span className="text-indigo-400 font-medium">{fileMeta.name} ({fileMeta.sizeMB} MB)</span> : "Drop file or click to browse"}
                </p>
                <input ref={inputRef} type="file" accept=".csv,.xlsx" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(""); setResult(null); } }} />
              </div>
              {error && <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-xs">{error}</div>}
              <div className="mt-4 flex flex-col gap-2">
                <button disabled={!file || busy} onClick={() => uploadFile(file)}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {busy
                    ? <span className="flex items-center justify-center gap-2"><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</span>
                    : "Upload & Analyze"}
                </button>
                <button onClick={resetAll} disabled={busy} className="w-full border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-300 py-2 rounded-xl text-sm transition-colors disabled:opacity-40">
                  Reset
                </button>
              </div>
            </div>

            {result && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
                <h3 className="text-white font-semibold text-sm mb-3">Downloads</h3>
                <a href={`${API_URL}${result.cleanedFile}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 p-3 bg-zinc-800 hover:bg-zinc-700/80 rounded-xl transition-colors group">
                  <span className="text-lg">📊</span>
                  <div>
                    <div className="text-white text-xs font-medium group-hover:text-indigo-300 transition-colors">Cleaned Excel</div>
                    <div className="text-zinc-500 text-xs">.xlsx output</div>
                  </div>
                </a>
                <a href={`${API_URL}${result.reportPdf}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 p-3 bg-zinc-800 hover:bg-zinc-700/80 rounded-xl transition-colors group">
                  <span className="text-lg">📄</span>
                  <div>
                    <div className="text-white text-xs font-medium group-hover:text-indigo-300 transition-colors">PDF Report</div>
                    <div className="text-zinc-500 text-xs">Charts + summary</div>
                  </div>
                </a>
              </div>
            )}

            <HistorySidebar history={history} selectedId={result?.id} onSelect={r => { setResult(r); setActiveTab("overview"); }} />
          </div>

          {/* Main */}
          <div className="space-y-4">
            {!result ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-16 text-center">
                <div className="text-6xl mb-4">📈</div>
                <h2 className="text-white font-semibold text-xl mb-2">Ready to analyze</h2>
                <p className="text-zinc-500 text-sm max-w-sm mx-auto">Upload a CSV or Excel file and get instant statistics, visualizations, and a downloadable report.</p>
                <div className="mt-8 grid grid-cols-3 gap-4 max-w-lg mx-auto">
                  {[["🧹","Auto Clean","Removes dupes & nulls"],["📊","Visualize","Charts & distributions"],["📄","PDF Report","Shareable summary"]].map(([icon,title,desc]) => (
                    <div key={title} className="bg-zinc-800/60 rounded-xl p-4">
                      <div className="text-2xl mb-2">{icon}</div>
                      <div className="text-white text-xs font-semibold">{title}</div>
                      <div className="text-zinc-500 text-xs mt-1">{desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Rows", value: result.rows?.toLocaleString(), icon: "📋" },
                    { label: "Columns", value: result.cols, icon: "📐" },
                    { label: "Numeric Cols", value: numericCols.length, icon: "🔢" },
                    { label: "Total Missing", value: columns.reduce((s, c) => s + (c.missing || 0), 0).toLocaleString(), icon: "⚠️" },
                  ].map(s => (
                    <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                      <div className="text-2xl mb-1">{s.icon}</div>
                      <div className="text-white font-bold text-xl">{s.value}</div>
                      <div className="text-zinc-500 text-xs">{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
                  {["overview","statistics","preview"].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${activeTab === t ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
                      {t}
                    </button>
                  ))}
                </div>

                {activeTab === "overview" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <NullChart columns={columns} />
                    <TypesPieChart columns={columns} />
                    {numericCols.length > 0 && <NumericStatsChart columns={columns} />}
                    <UniquenessChart columns={columns} />
                  </div>
                )}
                {activeTab === "statistics" && <ColumnTable columns={columns} />}
                {activeTab === "preview" && <PreviewTable preview={result.preview} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AppInner() {
  const { user } = useAuth();
  const [authMode, setAuthMode] = useState("login");
  if (!user) return <AuthPage mode={authMode} onSwitch={() => setAuthMode(m => m === "login" ? "register" : "login")} />;
  return <Dashboard />;
}

export default function App() {
  return <AuthProvider><AppInner /></AuthProvider>;
}