import type { Story } from "./types";

// Prefix values that spreadsheets would evaluate as formulas.
const defuse = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const quote = (value: string) => `"${defuse(value).replaceAll('"', '""')}"`;

/** CSV with a UTF-8 BOM and CRLF line endings so Excel opens accented titles correctly. */
export const storiesToCsv = (stories: Story[]): string => {
    const rows = stories.map(s => `${quote(s.title)},${s.estimate === null ? "" : defuse(s.estimate)}`);
    return `﻿${["Story,Estimate", ...rows].join("\r\n")}\r\n`;
};
