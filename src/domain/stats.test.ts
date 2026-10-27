import { describe, expect, it } from "vitest";
import { DECKS } from "./decks";
import { computeStats } from "./stats";

describe("computeStats", () => {
    it("computes average, median, mode and suggestion over numeric cards only", () => {
        const stats = computeStats(DECKS.fibonacci, ["3", "5", "5", "8", "?", "☕"]);
        expect(stats.count).toBe(6);
        expect(stats.average).toBeCloseTo(5.25);
        expect(stats.median).toBe("5");
        expect(stats.mode).toEqual(["5"]);
        expect(stats.suggested).toBe("5");
        expect(stats.consensus).toBe(false);
        expect(stats.distribution).toEqual([
            { label: "3", count: 1 },
            { label: "5", count: 2 },
            { label: "8", count: 1 },
            { label: "?", count: 1 },
            { label: "☕", count: 1 },
        ]);
    });

    it("detects consensus and ignores special cards when doing so", () => {
        const stats = computeStats(DECKS.fibonacci, ["8", "8", "?"]);
        expect(stats.consensus).toBe(true);
        expect(stats.outliers).toEqual([]);
    });

    it("flags votes more than one card away from the median", () => {
        const stats = computeStats(DECKS.fibonacci, ["2", "3", "3", "5", "21"]);
        expect(stats.median).toBe("3");
        expect(stats.outliers).toEqual(["21"]);
        expect(computeStats(DECKS.fibonacci, ["5", "13"]).outliers).toEqual([]);
    });

    it("uses card order for T-shirt sizes", () => {
        const stats = computeStats(DECKS["t-shirt"], ["S", "M", "M", "XL"]);
        expect(stats.average).toBeNull();
        expect(stats.median).toBe("M");
        expect(stats.suggested).toBe("M");
        expect(stats.outliers).toEqual(["XL"]);
    });

    it("handles rounds with only special cards or no votes", () => {
        expect(computeStats(DECKS.fibonacci, ["?", "☕"])).toMatchObject({
            average: null,
            median: null,
            suggested: null,
            consensus: false,
        });
        expect(computeStats(DECKS.fibonacci, []).count).toBe(0);
    });

    it("ignores labels that are not in the deck", () => {
        expect(computeStats(DECKS.fibonacci, ["XL", "5"]).distribution).toEqual([{ label: "5", count: 1 }]);
    });
});
