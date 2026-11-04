/** Génération CSV (séparateur `;`, BOM UTF-8 pour Excel, échappement RFC 4180). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.map(escape).join(";"), ...rows.map((row) => row.map(escape).join(";"))];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function csvResponse(filename: string, content: string): Response {
  return new Response(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
