import { describe, expect, it } from "vitest";
import { storiesToCsv } from "./csv";

describe("storiesToCsv", () => {
    it("writes a header, escapes quotes and leaves missing estimates empty", () => {
        const csv = storiesToCsv([
            { id: "1", title: 'Fix "login", again', estimate: "5" },
            { id: "2", title: "Città", estimate: null },
        ]);
        expect(csv).toBe('﻿Story,Estimate\r\n"Fix ""login"", again",5\r\n"Città",\r\n');
    });

    it("neutralises spreadsheet formulas", () => {
        expect(storiesToCsv([{ id: "1", title: "=HYPERLINK(1)", estimate: "+3" }])).toContain(`"'=HYPERLINK(1)",'+3`);
    });
});
