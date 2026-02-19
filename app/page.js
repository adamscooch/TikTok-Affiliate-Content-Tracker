'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Script from 'next/script';
import { parseTSV } from '../lib/parse';

const RechartsComponents = dynamic(
  () => import('recharts').then((mod) => {
    return function Charts(props) {
      return props.children(mod);
    };
  }),
  { ssr: false, loading: () => <div style={{ height: 360 }} /> }
);

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const ALLOWED_DOMAIN = "scooch.com";

const COLORS = [
  "#E94560", "#00B894", "#6C5CE7", "#FDCB6E", "#00CEC9",
  "#FF6B6B", "#A29BFE", "#FD79A8", "#55E6C1", "#5F27CD",
  "#F8A5C2", "#63CDDA", "#F19066", "#786FA6", "#3DC1D3",
];

const METRICS = [
  { key: "gmv", label: "GMV ($)", format: (v) => `$${v.toFixed(2)}` },
  { key: "orders", label: "Orders", format: (v) => v.toString() },
  { key: "items_sold", label: "Items Sold", format: (v) => v.toString() },
  { key: "commission", label: "Commission ($)", format: (v) => `$${v.toFixed(2)}` },
];

function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(atob(base64).split('').map(c =>
    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
  ).join('')));
}

const tiktokUrl = (creator, videoId) =>
  `https://www.tiktok.com/@${creator.replace(/^@/,'')}/video/${videoId}`;

function TikTokTracker() {
  const [weeksData, setWeeksData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMetric, setActiveMetric] = useState("gmv");
  const [groupBy, setGroupBy] = useState("creator");
  const [hiddenLines, setHiddenLines] = useState(new Set());
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  });
  const [showImport, setShowImport] = useState(false);
  const [importWeek, setImportWeek] = useState("");
  const [importText, setImportText] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [showTable, setShowTable] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/weeks');
      const data = await res.json();
      setWeeksData(data);
    } catch {
      setWeeksData([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleImport = useCallback(async () => {
    if (!importWeek || !importText.trim()) {
      setImportStatus("Need both a week ending date and pasted data.");
      return;
    }
    const rows = parseTSV(importText);
    if (rows.length === 0) {
      setImportStatus("Couldn't parse any rows. Copy from TikTok export (with headers) as tab-separated.");
      return;
    }
    const records = rows.map((r) => ({
      video_id: r.video_id,
      creator: r.creator,
      product: r.product.length > 50 ? r.product.slice(0, 50) : r.product,
      gmv: r.gmv,
      orders: r.orders,
      items_sold: r.items_sold,
      commission: r.commission,
      video_title: r.video_title.length > 80 ? r.video_title.slice(0, 80) + "..." : r.video_title,
    }));

    try {
      const res = await fetch('/api/weeks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week: importWeek, records }),
      });
      const result = await res.json();
      await fetchData();
      setImportText("");
      setImportWeek("");
      setImportStatus(`Imported ${result.count} videos for week ending ${importWeek}.`);
      setTimeout(() => setImportStatus(""), 3000);
    } catch {
      setImportStatus("Failed to import data. Please try again.");
    }
  }, [importWeek, importText, fetchData]);

  const handleReset = useCallback(async () => {
    await fetch('/api/seed', { method: 'POST' });
    await fetchData();
    setHiddenLines(new Set());
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setDateRange({ start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });
  }, [fetchData]);

  const handleExportCSV = useCallback(() => {
    const rows = [["Week","Creator","Video ID","Product","GMV","Orders","Items Sold","Commission"]];
    for (const wd of weeksData) {
      for (const r of wd.records) {
        rows.push([wd.week, r.creator, r.video_id, r.product, r.gmv, r.orders, r.items_sold, r.commission]);
      }
    }
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tiktok_affiliate_data.csv"; a.click();
    URL.revokeObjectURL(url);
  }, [weeksData]);

  const allWeeks = useMemo(() => weeksData.map((w) => w.week).sort((a, b) => new Date(a) - new Date(b)), [weeksData]);

  const filteredWeeks = useMemo(() => {
    return allWeeks.filter((w) => {
      const d = new Date(w);
      if (dateRange.start) {
        const start = new Date(dateRange.start + 'T00:00:00');
        if (d < start) return false;
      }
      if (dateRange.end) {
        const end = new Date(dateRange.end + 'T23:59:59');
        if (d > end) return false;
      }
      return true;
    });
  }, [allWeeks, dateRange]);

  const { chartData, lineKeys, lineLabels, colorMap } = useMemo(() => {
    const groups = {};
    for (const wd of weeksData) {
      for (const r of wd.records) {
        const key = groupBy === "creator" ? r.creator : r.video_id;
        const label = groupBy === "creator" ? r.creator : `${r.creator} — ${r.video_id.slice(-6)}`;
        if (!groups[key]) groups[key] = { label, weekData: {}, creator: r.creator };
        if (!groups[key].weekData[wd.week]) groups[key].weekData[wd.week] = 0;
        groups[key].weekData[wd.week] += r[activeMetric] || 0;
      }
    }
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const totalA = Object.values(groups[a].weekData).reduce((s, v) => s + v, 0);
      const totalB = Object.values(groups[b].weekData).reduce((s, v) => s + v, 0);
      return totalB - totalA;
    });
    const colorMap = {};
    sortedKeys.forEach((k, i) => { colorMap[k] = COLORS[i % COLORS.length]; });
    const chartData = filteredWeeks.map((week) => {
      const point = { week };
      for (const key of sortedKeys) {
        if (!hiddenLines.has(key)) {
          point[key] = groups[key].weekData[week] || 0;
        }
      }
      return point;
    });
    const lineLabels = {};
    sortedKeys.forEach((k) => { lineLabels[k] = groups[k].label; });
    return { chartData, lineKeys: sortedKeys, lineLabels, colorMap };
  }, [weeksData, filteredWeeks, activeMetric, groupBy, hiddenLines]);

  const metricInfo = METRICS.find((m) => m.key === activeMetric);

  const tableData = useMemo(() => {
    if (!showTable) return [];
    const rows = [];
    for (const wd of weeksData) {
      if (!filteredWeeks.includes(wd.week)) continue;
      for (const r of wd.records) {
        rows.push({ ...r, week: wd.week });
      }
    }
    return rows.sort((a, b) => b.gmv - a.gmv);
  }, [weeksData, filteredWeeks, showTable]);

  const totals = useMemo(() => {
    let gmv = 0, orders = 0, commission = 0, creators = new Set(), videos = new Set();
    for (const wd of weeksData) {
      if (!filteredWeeks.includes(wd.week)) continue;
      for (const r of wd.records) {
        gmv += r.gmv; orders += r.orders; commission += r.commission;
        creators.add(r.creator); videos.add(r.video_id);
      }
    }
    return { gmv, orders, commission, creators: creators.size, videos: videos.size };
  }, [weeksData, filteredWeeks]);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#6B7280" }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div className="header-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#E94560", letterSpacing: -0.5 }}>
              TikTok Affiliate Tracker
            </h1>
            <span style={{ fontSize: 11, background: "#1E2533", color: "#6B7280", padding: "3px 10px", borderRadius: 6, fontWeight: 500 }}>
              SCOOCH
            </span>
          </div>
          <p style={{ color: "#484F58", fontSize: 14, marginTop: 4 }}>
            {weeksData.length} weeks · {weeksData.reduce((s, w) => s + w.records.length, 0)} records · {totals.creators} creators
          </p>
        </div>
        <div className="header-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setShowImport(!showImport)}
            className={showImport ? "btn-primary" : "btn-ghost"}
            style={showImport ? {} : { color: "#E94560", borderColor: "#E9456033" }}>
            {showImport ? "✕ Close" : "+ Import"}
          </button>
          <button onClick={() => setShowTable(!showTable)} className="btn-ghost">
            {showTable ? "Hide Table" : "Table"}
          </button>
          <button onClick={handleExportCSV} className="btn-ghost">
            ↓ CSV
          </button>
        </div>
      </div>

      <div className="glow-line" />

      {/* Import Panel */}
      {showImport && (
        <div className="card" style={{ marginBottom: 20, borderColor: "#E9456033" }}>
          <h3 style={{ margin: "0 0 8px", color: "#E94560", fontSize: 16, fontWeight: 700 }}>Import Weekly Export</h3>
          <p style={{ color: "#484F58", fontSize: 13, margin: "0 0 14px" }}>
            Open TikTok export in Excel → Select all data including headers → Copy → Paste below
          </p>
          <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ color: "#6B7280", fontSize: 13 }}>Week ending:</label>
            <input type="text" placeholder="MM/DD/YYYY" value={importWeek}
              onChange={(e) => setImportWeek(e.target.value)} className="import-input" />
          </div>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste tab-separated data here (with header row)..." className="import-textarea" />
          <div style={{ display: "flex", gap: 12, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={handleImport} className="btn-primary">Import Data</button>
            <button onClick={handleReset} className="btn-ghost">Reset to Sample</button>
            {importStatus && <span style={{ color: importStatus.includes("Imported") ? "#00B894" : "#E94560", fontSize: 13 }}>{importStatus}</span>}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="controls-row" style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap", alignItems: "center" }}>
        <div className="pill-group">
          {METRICS.map((m) => (
            <button key={m.key} onClick={() => setActiveMetric(m.key)}
              className={`pill-btn ${activeMetric === m.key ? "active red" : ""}`}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="pill-group">
          {[{ key: "creator", label: "By Creator" }, { key: "video", label: "By Video" }].map((g) => (
            <button key={g.key} onClick={() => { setGroupBy(g.key); setHiddenLines(new Set()); }}
              className={`pill-btn ${groupBy === g.key ? "active purple" : ""}`}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="date-range-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#484F58", fontSize: 13 }}>From</span>
          <input type="date" value={dateRange.start} onChange={(e) => setDateRange((d) => ({ ...d, start: e.target.value }))} className="date-input" />
          <span style={{ color: "#484F58", fontSize: 13 }}>to</span>
          <input type="date" value={dateRange.end} onChange={(e) => setDateRange((d) => ({ ...d, end: e.target.value }))} className="date-input" />
          <button onClick={() => setDateRange({ start: "", end: "" })} className="btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }}>All Time</button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Total GMV", value: `$${totals.gmv.toFixed(2)}`, color: "#00B894" },
          { label: "Orders", value: totals.orders, color: "#6C5CE7" },
          { label: "Commission", value: `$${totals.commission.toFixed(2)}`, color: "#FDCB6E" },
          { label: "Creators", value: totals.creators, color: "#00CEC9" },
          { label: "Weeks", value: filteredWeeks.length, color: "#E94560" },
        ].map((card) => (
          <div key={card.label} className="card" style={{ padding: "16px 18px" }}>
            <div className="stat-label">{card.label}</div>
            <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card card-glow" style={{ marginBottom: 20, padding: "20px 16px 10px" }}>
        <h3 style={{ margin: "0 0 14px", color: "#C9D1D9", fontSize: 15, fontWeight: 600 }}>
          {metricInfo.label} by {groupBy === "creator" ? "Creator" : "Video"} — Week over Week
        </h3>
        <RechartsComponents>
          {({ LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid }) => (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2533" />
                <XAxis dataKey="week" stroke="#484F58" fontSize={12} fontFamily="DM Sans" />
                <YAxis stroke="#484F58" fontSize={12} fontFamily="DM Sans" tickFormatter={metricInfo.format} />
                <Tooltip
                  contentStyle={{ background: "#12161E", border: "1px solid #1E2533", borderRadius: 10, color: "#C9D1D9", fontSize: 13, fontFamily: "DM Sans" }}
                  formatter={(value, name) => [metricInfo.format(value), lineLabels[name] || name]}
                  labelStyle={{ color: "#E94560", fontWeight: 700, marginBottom: 4 }}
                />
                {lineKeys.filter((k) => !hiddenLines.has(k)).map((key) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={colorMap[key]} strokeWidth={2.5}
                    dot={{ r: 4, fill: colorMap[key], strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls={false} name={key} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </RechartsComponents>
      </div>

      {/* Toggle Legend */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: "#C9D1D9", fontSize: 13, fontWeight: 600 }}>
            Toggle {groupBy === "creator" ? "Creators" : "Videos"}
          </h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setHiddenLines(new Set())} className="btn-ghost" style={{ padding: "4px 12px", fontSize: 11, color: "#00B894" }}>Show All</button>
            <button onClick={() => setHiddenLines(new Set(lineKeys))} className="btn-ghost" style={{ padding: "4px 12px", fontSize: 11, color: "#E94560" }}>Hide All</button>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {lineKeys.map((key) => {
            const isHidden = hiddenLines.has(key);
            return (
              <button key={key} onClick={() => {
                const next = new Set(hiddenLines);
                isHidden ? next.delete(key) : next.add(key);
                setHiddenLines(next);
              }}
                className="toggle-pill"
                style={{
                  borderColor: colorMap[key],
                  background: isHidden ? "transparent" : colorMap[key] + "18",
                  color: isHidden ? "#484F58" : "#C9D1D9",
                  opacity: isHidden ? 0.35 : 1,
                }}>
                <span className="dot" style={{ background: colorMap[key] }} />
                {lineLabels[key]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Data Table */}
      {showTable && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ margin: "0 0 14px", color: "#C9D1D9", fontSize: 15, fontWeight: 600 }}>All Records</h3>
          <table className="data-table">
            <thead>
              <tr>
                {["Week", "Creator", "Video", "Product", "GMV", "Orders", "Items", "Commission"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((r, i) => (
                <tr key={i}>
                  <td style={{ color: "#E94560", fontWeight: 600, whiteSpace: "nowrap" }}>{r.week}</td>
                  <td>{r.creator}</td>
                  <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                    <a href={tiktokUrl(r.creator, r.video_id)} target="_blank" rel="noopener noreferrer">
                      ...{r.video_id.slice(-8)}
                    </a>
                  </td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.product}</td>
                  <td style={{ color: "#00B894", fontWeight: 600 }}>${r.gmv.toFixed(2)}</td>
                  <td>{r.orders}</td>
                  <td>{r.items_sold}</td>
                  <td style={{ color: "#FDCB6E" }}>${r.commission.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 32, color: "#2D333B", fontSize: 12 }}>
        Scooch · TikTok Affiliate Performance Tracker · Data is shared across your team
      </div>
    </div>
  );
}

export default function AuthGate() {
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("scooch-auth-user");
      if (stored) setUser(JSON.parse(stored));
    } catch {}
    setMounted(true);
  }, []);

  const handleCredentialResponse = useCallback((response) => {
    try {
      const payload = parseJwt(response.credential);
      const email = payload.email || "";
      const domain = email.split("@")[1];
      if (domain !== ALLOWED_DOMAIN) {
        setError(`Access restricted to @${ALLOWED_DOMAIN} accounts. You signed in with ${email}.`);
        return;
      }
      const userData = { email, name: payload.name, picture: payload.picture };
      sessionStorage.setItem("scooch-auth-user", JSON.stringify(userData));
      setUser(userData);
      setError("");
    } catch {
      setError("Authentication failed. Please try again.");
    }
  }, []);

  useEffect(() => {
    if (user || !mounted) return;
    const interval = setInterval(() => {
      if (window.google && btnRef.current) {
        clearInterval(interval);
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        });
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: "filled_black",
          size: "large",
          text: "signin_with",
          shape: "pill",
        });
      }
    }, 100);
    return () => clearInterval(interval);
  }, [user, mounted, handleCredentialResponse]);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem("scooch-auth-user");
    setUser(null);
    setError("");
  }, []);

  if (!mounted) return null;

  if (!user) {
    return (
      <>
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <div className="login-screen">
          <h1>TikTok Affiliate Tracker</h1>
          <span style={{ fontSize: 11, background: "#1E2533", color: "#6B7280", padding: "3px 10px", borderRadius: 6, fontWeight: 500 }}>SCOOCH</span>
          <p>Sign in with your @{ALLOWED_DOMAIN} Google account to continue</p>
          <div ref={btnRef} />
          {error && <div className="login-error">{error}</div>}
        </div>
      </>
    );
  }

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 24px 0" }}>
          <button className="logout-btn" onClick={handleLogout}>
            {user.email} · Sign out
          </button>
        </div>
        <TikTokTracker />
      </div>
    </>
  );
}
