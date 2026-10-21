export function day(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
export function dateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "short",
      }).format(d);
}
export function time(value?: string | null) {
  return value
    ? new Date(value).toLocaleTimeString("es-PE", {
        timeZone: "America/Lima",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
export function duration(seconds: number | null | undefined) {
  return seconds == null ? "—" : Math.round(seconds / 60) + " min";
}
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const a = crypto.getRandomValues(new Uint8Array(16));
  a[6] = (a[6] & 15) | 64;
  a[8] = (a[8] & 63) | 128;
  const x = Array.from(a, (v) => v.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const cell = (v: unknown) => {
    let s =
      v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const text = [
    keys.map(cell).join(";"),
    ...rows.map((r) => keys.map((k) => cell(r[k])).join(";")),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
