export function AppHeader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 950, letterSpacing: -0.5, color: "#EAF0FF" }}>
          REPLAY <span style={{ color: "#FFB14A" }}>FS</span>
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
          color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
          border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, padding: "1px 5px",
        }}>
          World Cup
        </span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {["🏀", "⚽"].map((icon, i) => (
          <div key={i} style={{
            width: 26, height: 26, borderRadius: 8,
            background: i === 1 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
            border: i === 1 ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, cursor: "pointer",
          }}>
            {icon}
          </div>
        ))}
      </div>
    </div>
  );
}
