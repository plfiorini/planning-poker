import { useState } from "react";
import type { Deck } from "../domain/decks";

interface Props {
    deck: Deck;
    round: number;
    selected: string | null;
    disabled: boolean;
    onSelect: (value: string | null) => void;
}

export const CardHand = ({ deck, round, selected, disabled, onSelect }: Props) => {
    // A mouse resting on last round's card would keep its hover lift and look still selected.
    // Hold back hover effects after a new round starts until the pointer moves.
    const [fresh, setFresh] = useState(false);
    const [seenRound, setSeenRound] = useState(round);
    if (round !== seenRound) {
        setSeenRound(round);
        setFresh(true);
    }

    return (
        <section
            className={`hand ${fresh ? "fresh" : ""}`}
            aria-label="Your cards"
            onPointerMove={fresh ? () => setFresh(false) : undefined}
        >
            {deck.cards.map(card => {
                const isSelected = card.label === selected;
                return (
                    <button
                        key={card.label}
                        type="button"
                        className={`card face up pick ${isSelected ? "selected" : ""}`}
                        aria-pressed={isSelected}
                        disabled={disabled}
                        onClick={() => onSelect(isSelected ? null : card.label)}
                        title={card.label === "☕" ? "I need a break" : card.label === "?" ? "No idea" : undefined}
                    >
                        {card.label}
                    </button>
                );
            })}
        </section>
    );
};
