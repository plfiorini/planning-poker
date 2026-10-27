import { DECK_LIST, isDeckId } from "../domain/decks";
import { randomId } from "../domain/ids";
import type { RoomState } from "../domain/types";
import type { RoomSync } from "../net/roomSync";
import { useCountdown } from "../state/useRoom";

const DURATIONS = [30, 60, 120, 300];

const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

interface Props {
    state: RoomState;
    sync: RoomSync;
    /** Only admins run the session; everyone else gets a read-only status line. */
    canControl: boolean;
    adminAway: boolean;
}

export const Controls = ({ state, sync, canControl, adminAway }: Props) => {
    const remaining = useCountdown(sync, state.timer);
    const voting = state.phase === "voting";
    const anyVoted = state.participants.some(p => p.voted);
    const countdown = state.timer && remaining !== null && (
        <span className={`countdown ${remaining <= 10 ? "urgent" : ""}`} aria-live="polite">
            ⏱ {formatSeconds(remaining)}
        </span>
    );

    if (!canControl) {
        let message = voting ? "Pick a card. The admin reveals when everyone's ready." : "Waiting for the admin…";
        if (adminAway) message = "The admin is away. Voting still works, and they'll pick up when they're back.";
        return (
            <section className="controls" aria-label="Round status">
                {countdown}
                <p className="muted">{message}</p>
            </section>
        );
    }

    return (
        <section className="controls" aria-label="Round controls">
            {voting ? (
                <button
                    type="button"
                    className="primary"
                    disabled={!anyVoted}
                    onClick={() => sync.dispatch({ type: "reveal" })}
                >
                    Reveal cards
                </button>
            ) : (
                <button type="button" className="primary" onClick={() => sync.dispatch({ type: "newRound" })}>
                    Vote again
                </button>
            )}

            <div className="timer">
                {countdown ? (
                    <>
                        {countdown}
                        <button type="button" onClick={() => sync.dispatch({ type: "stopTimer" })}>
                            Stop
                        </button>
                    </>
                ) : (
                    <label>
                        <span className="sr-only">Start timer</span>
                        <select
                            value=""
                            disabled={!voting}
                            onChange={e =>
                                sync.dispatch({
                                    type: "startTimer",
                                    timerId: randomId(),
                                    durationSec: Number(e.target.value),
                                })
                            }
                        >
                            <option value="" disabled>
                                ⏱ Timer…
                            </option>
                            {DURATIONS.map(d => (
                                <option key={d} value={d}>
                                    {formatSeconds(d)}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
                <label className="checkbox">
                    <input
                        type="checkbox"
                        checked={state.autoReveal}
                        onChange={e => sync.dispatch({ type: "setAutoReveal", autoReveal: e.target.checked })}
                    />
                    Auto-reveal when time is up
                </label>
            </div>

            <label>
                <span className="sr-only">Deck</span>
                <select
                    value={state.deckId}
                    onChange={e =>
                        isDeckId(e.target.value) && sync.dispatch({ type: "setDeck", deckId: e.target.value })
                    }
                >
                    {DECK_LIST.map(d => (
                        <option key={d.id} value={d.id}>
                            {d.name}
                        </option>
                    ))}
                </select>
            </label>
        </section>
    );
};
