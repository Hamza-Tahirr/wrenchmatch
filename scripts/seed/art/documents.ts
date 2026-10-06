// Sample identity and insurance documents for the mechanic applications. They are clearly
// fictional: every one carries a diagonal SAMPLE watermark and says that no authority or
// insurer issued it, and the ID card does not imitate any real card's layout.
import { blur, linear, n, radial, roundRect, text } from "./kit";

/** A subtle diagonal "SAMPLE" watermark repeated across the page. */
function sampleWatermark(width: number, height: number, size: number, color: string, opacity: number): string {
  const rows: string[] = [];
  const stepY = size * 2.6;
  const stepX = size * 5.2;
  for (let y = -height * 0.4, row = 0; y < height * 1.4; y += stepY, row += 1) {
    for (let x = -width * 0.4 + (row % 2) * (stepX / 2); x < width * 1.4; x += stepX) {
      rows.push(text(x, y, "SAMPLE", { size, fill: color, weight: 700, font: "display", spacing: size * 0.18, opacity }));
    }
  }
  return `<g transform="rotate(-24 ${width / 2} ${height / 2})">${rows.join("")}</g>`;
}

function field(x: number, y: number, label: string, value: string, valueSize = 32): string {
  return (
    text(x, y, label, { size: 19, fill: "#475569", weight: 700, spacing: 2, font: "display" }) +
    text(x, y + valueSize + 8, value, { size: valueSize, fill: "#0f172a", weight: 600, font: "sans" })
  );
}

/** Wavy security-style background lines (purely decorative). */
function guilloche(width: number, height: number, color: string): string {
  const lines: string[] = [];
  for (let index = 0; index < 18; index += 1) {
    const y = 40 + index * (height / 18);
    let d = `M 0 ${n(y)}`;
    for (let x = 0; x <= width; x += 40) {
      d += ` Q ${n(x + 20)} ${n(y + (index % 2 ? 14 : -14))} ${n(x + 40)} ${n(y)}`;
    }
    lines.push(`<path d="${d}" stroke="${color}" stroke-width="1.2" fill="none" opacity="0.35"/>`);
  }
  return lines.join("");
}

export type IdCardSpec = { fullName: string; documentNumber: string; expiresOn: string; blurred?: boolean };

/** A sample photo-ID card for a fictional person. */
export function idCardSvg(spec: IdCardSpec): string {
  const blurAttr = spec.blurred ? ` filter="url(#unreadable)"` : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630">`,
    `<defs>`,
    linear("card", [0, 0, 1, 1], [
      [0, "#f0fdfa"],
      [0.5, "#e0f2fe"],
      [1, "#ede9fe"],
    ]),
    linear("band", [0, 0, 1, 0], [
      [0, "#0f766e"],
      [1, "#4338ca"],
    ]),
    radial("portrait", { cx: 0.5, cy: 0.35, r: 0.8 }, [
      [0, "#e2e8f0"],
      [1, "#94a3b8"],
    ]),
    blur("unreadable", 7),
    `</defs>`,
    `<rect width="1000" height="630" fill="#1e293b"/>`,
    `<g${blurAttr}>`,
    `<path d="${roundRect(14, 14, 972, 602, 34)}" fill="url(#card)"/>`,
    `<g opacity="0.6">${guilloche(1000, 630, "#5eead4")}</g>`,
    `<path d="M 14 48 C 14 29 29 14 48 14 H 952 C 971 14 986 29 986 48 V 118 H 14 Z" fill="url(#band)"/>`,
    text(52, 80, "SAMPLE IDENTIFICATION CARD", { size: 36, fill: "#ffffff", weight: 700, font: "display", spacing: 3 }),
    text(948, 80, "NOT A GOVERNMENT ID", { size: 20, fill: "#ccfbf1", weight: 700, anchor: "end", font: "display", spacing: 2 }),
    `<path d="${roundRect(52, 156, 248, 316, 18)}" fill="url(#portrait)"/>`,
    `<circle cx="176" cy="276" r="66" fill="#64748b"/>`,
    `<path d="M 72 472 C 82 380 270 380 280 472 Z" fill="#64748b"/>`,
    field(340, 168, "NAME", spec.fullName),
    field(340, 262, "ID NUMBER", spec.documentNumber),
    field(340, 356, "DATE OF BIRTH", "01/01/1990 (sample)"),
    field(340, 450, "EXPIRES", spec.expiresOn),
    `<path d="${roundRect(760, 430, 180, 100, 14)}" fill="#ffffff" opacity="0.65"/>`,
    ...Array.from({ length: 14 }, (_, index) => `<path d="M ${776 + index * 11} 446 v 68" stroke="#0f172a" stroke-width="${index % 3 === 0 ? 4 : 2}"/>`),
    text(52, 580, "Fictional sample document. Not issued by any authority.", { size: 22, fill: "#334155", font: "sans" }),
    `</g>`,
    sampleWatermark(1000, 630, 64, "#be123c", 0.14),
    `</svg>`,
  ].join("");
}

export type InsuranceSpec = { insuredName: string; provider: string; policyNumber: string; effectiveOn: string; expiresOn: string };

/** A sample certificate of liability insurance. */
export function insuranceSvg(spec: InsuranceSpec): string {
  const row = (y: number, label: string, value: string) =>
    [
      `<path d="M 90 ${y - 34} H 760" stroke="#e2e8f0" stroke-width="2"/>`,
      text(90, y, label, { size: 19, fill: "#475569", weight: 700, spacing: 2, font: "display" }),
      text(90, y + 42, value, { size: 30, fill: "#0f172a", weight: 600, font: "sans" }),
    ].join("");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="850" height="1100" viewBox="0 0 850 1100">`,
    `<defs>`,
    linear("head", [0, 0, 1, 0], [
      [0, "#0f172a"],
      [1, "#1e3a8a"],
    ]),
    `</defs>`,
    `<rect width="850" height="1100" fill="#ffffff"/>`,
    `<rect x="40" y="40" width="770" height="1020" fill="none" stroke="#0f172a" stroke-width="3"/>`,
    `<rect x="40" y="40" width="770" height="150" fill="url(#head)"/>`,
    text(425, 102, "CERTIFICATE OF LIABILITY INSURANCE", { size: 31, fill: "#ffffff", weight: 700, anchor: "middle", font: "display", spacing: 1 }),
    text(425, 146, "SAMPLE CERTIFICATE · NOT PROOF OF COVERAGE", { size: 20, fill: "#bfdbfe", weight: 700, anchor: "middle", font: "display", spacing: 2 }),
    row(270, "INSURED", spec.insuredName),
    row(380, "INSURER", spec.provider),
    row(490, "POLICY NUMBER", spec.policyNumber),
    row(600, "COVERAGE", "General liability, $1,000,000 per occurrence"),
    row(710, "POLICY PERIOD", `${spec.effectiveOn} to ${spec.expiresOn}`),
    `<path d="M 90 800 H 760" stroke="#e2e8f0" stroke-width="2"/>`,
    text(90, 880, "Fictional sample for the WrenchMatch application flow.", { size: 23, fill: "#334155", font: "sans" }),
    text(90, 916, "It confers no coverage, and no insurer issued it.", { size: 23, fill: "#334155", font: "sans" }),
    `<circle cx="680" cy="960" r="62" fill="none" stroke="#1e3a8a" stroke-width="4" opacity="0.5"/>`,
    text(680, 968, "SAMPLE", { size: 24, fill: "#1e3a8a", weight: 700, anchor: "middle", font: "display", opacity: 0.6 }),
    sampleWatermark(850, 1100, 70, "#be123c", 0.1),
    `</svg>`,
  ].join("");
}
