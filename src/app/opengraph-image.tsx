import { ImageResponse } from "next/og";

// The preview shown when someone shares a VinVerdict link (built once at build time).
export const alt = "VinVerdict: a free second opinion before you buy a used car";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROWS: [string, string, string][] = [
  ["Listing trust", "Warning", "#ff8a7a"],
  ["Car condition", "Not checked", "#8a929b"],
  ["Price", "Check", "#f0c26a"],
  ["Ready to pay", "Warning", "#ff8a7a"],
];

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#000", color: "#f2f4f6", padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 80, letterSpacing: -2 }}>VinVerdict</div>
            <div style={{ fontSize: 40, lineHeight: 1.25, marginTop: 18, color: "#c9d2dc" }}>A free second opinion before you buy a used car.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 26, color: "#8fb3f5", lineHeight: 1.5 }}>
            <div>Scam signs · fair price · recalls</div>
            <div>Every fact linked to its source</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 56, flex: 1, background: "#2a1512", borderLeft: "8px solid #ff8a7a", borderRadius: 16, padding: "36px 36px" }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 46, lineHeight: 1.1, color: "#ff8a7a" }}>
            <span>Stop:</span>
            <span>serious warning</span>
          </div>
          <div style={{ fontSize: 24, lineHeight: 1.35, marginTop: 16, color: "#e8d6d2" }}>Gift cards asked before viewing</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
            {ROWS.map(([area, status, color]) => (
              <div key={area} style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #4a2c27", padding: "14px 0", fontSize: 26 }}>
                <span>{area}</span>
                <span style={{ color, fontWeight: 700 }}>{status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
