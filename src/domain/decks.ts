import type { DeckId } from "./types";

export interface Card {
    label: string;
    /** Numeric value used for average/median. Absent for T-shirt sizes and special cards. */
    value?: number;
    /** Special cards (?, ☕, ∞) are shown in the distribution but excluded from the math. */
    special?: boolean;
}

export interface Deck {
    id: DeckId;
    name: string;
    cards: Card[];
}

const numeric = (labels: string[], values: number[]): Card[] => labels.map((label, i) => ({ label, value: values[i] }));

const QUESTION: Card = { label: "?", special: true };
const COFFEE: Card = { label: "☕", special: true };
const INFINITY: Card = { label: "∞", special: true };

export const DECKS: Record<DeckId, Deck> = {
    fibonacci: {
        id: "fibonacci",
        name: "Fibonacci",
        cards: [
            ...numeric(
                ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89"],
                [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89],
            ),
            QUESTION,
            COFFEE,
        ],
    },
    "modified-fibonacci": {
        id: "modified-fibonacci",
        name: "Modified Fibonacci",
        cards: [
            ...numeric(
                ["0", "½", "1", "2", "3", "5", "8", "13", "20", "40", "100"],
                [0, 0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100],
            ),
            QUESTION,
            INFINITY,
            COFFEE,
        ],
    },
    "t-shirt": {
        id: "t-shirt",
        name: "T-shirt sizes",
        cards: [...["XS", "S", "M", "L", "XL", "XXL"].map(label => ({ label })), QUESTION, COFFEE],
    },
    "powers-of-2": {
        id: "powers-of-2",
        name: "Powers of 2",
        cards: [...numeric(["0", "1", "2", "4", "8", "16", "32", "64"], [0, 1, 2, 4, 8, 16, 32, 64]), QUESTION, COFFEE],
    },
};

export const DECK_LIST: Deck[] = Object.values(DECKS);

export const isDeckId = (id: string): id is DeckId => id in DECKS;
