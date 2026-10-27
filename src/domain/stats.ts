import type { Deck } from "./decks";

export interface VoteStats {
    count: number;
    /** Cards that received at least one vote, in deck order. */
    distribution: { label: string; count: number }[];
    /** Only for decks with numeric values. */
    average: number | null;
    median: string | null;
    mode: string[];
    /** All non-special votes agree (at least two of them). */
    consensus: boolean;
    /** Card labels more than one step away from the median (needs at least three votes). */
    outliers: string[];
    /** Proposed final estimate: the card closest to the average, or the median for non-numeric decks. */
    suggested: string | null;
}

export const computeStats = (deck: Deck, votes: string[]): VoteStats => {
    const scale = deck.cards.filter(c => !c.special);
    const counts = new Map<string, number>();
    for (const vote of votes) {
        if (deck.cards.some(c => c.label === vote)) counts.set(vote, (counts.get(vote) ?? 0) + 1);
    }

    const distribution = deck.cards
        .filter(c => counts.has(c.label))
        .map(c => ({ label: c.label, count: counts.get(c.label) ?? 0 }));

    // Positions on the deck's ordered scale, sorted. Works for numeric and T-shirt decks alike.
    const positions = votes
        .map(v => scale.findIndex(c => c.label === v))
        .filter(i => i >= 0)
        .sort((a, b) => a - b);

    const scaled = distribution.filter(d => scale.some(c => c.label === d.label));
    const maxCount = Math.max(0, ...scaled.map(d => d.count));
    const mode = scaled.filter(d => d.count === maxCount).map(d => d.label);

    if (!positions.length) {
        return {
            count: votes.length,
            distribution,
            average: null,
            median: null,
            mode,
            consensus: false,
            outliers: [],
            suggested: null,
        };
    }

    // Lower median keeps the result on an actual card.
    const medianPos = positions[Math.floor((positions.length - 1) / 2)];
    const median = scale[medianPos].label;

    const values = positions.map(i => scale[i].value).filter((v): v is number => v !== undefined);
    const average = values.length === positions.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

    let suggested = median;
    if (average !== null) {
        let best = Number.POSITIVE_INFINITY;
        for (const card of scale) {
            const distance = Math.abs((card.value ?? 0) - average);
            // `<=` prefers the higher card on ties: underestimating is the costlier mistake.
            if (distance <= best) {
                best = distance;
                suggested = card.label;
            } else break;
        }
    }

    // With fewer than three votes there is no "rest of the team" to stand out from.
    const outliers =
        positions.length < 3
            ? []
            : [...new Set(positions.filter(i => Math.abs(i - medianPos) > 1))].map(i => scale[i].label);

    return {
        count: votes.length,
        distribution,
        average,
        median,
        mode,
        consensus: positions.length >= 2 && positions[0] === positions[positions.length - 1],
        outliers,
        suggested,
    };
};
