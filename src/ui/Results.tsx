import { useState } from "react";
import type { Deck } from "../domain/decks";
import type { VoteStats } from "../domain/stats";
import type { RoomSync } from "../net/roomSync";

interface Props {
    stats: VoteStats;
    /** Cards still on their way from voters. */
    pending: number;
    deck: Deck;
    canAccept: boolean;
    sync: RoomSync;
}

const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const Results = ({ stats, pending, deck, canAccept, sync }: Props) => {
    const [choice, setChoice] = useState<string | null>(null);
    const estimate = choice ?? stats.suggested ?? deck.cards[0].label;
    const max = Math.max(1, ...stats.distribution.map(d => d.count));

    return (
        <section className="panel results" aria-label="Results">
            <div className="metrics">
                {stats.consensus && <span className="tag success">🎉 Consensus</span>}
                {stats.average !== null && (
                    <div>
                        <span className="muted">Average</span>
                        <strong>{formatNumber(stats.average)}</strong>
                    </div>
                )}
                <div>
                    <span className="muted">Median</span>
                    <strong>{stats.median ?? "—"}</strong>
                </div>
                <div>
                    <span className="muted">Most voted</span>
                    <strong>{stats.mode.join(" / ") || "—"}</strong>
                </div>
                <div>
                    <span className="muted">Votes</span>
                    <strong>{stats.count}</strong>
                </div>
            </div>

            <ul className="distribution">
                {stats.distribution.map(d => (
                    <li key={d.label} className={stats.outliers.includes(d.label) ? "outlier" : ""}>
                        <span className="label">{d.label}</span>
                        <span className="bar" style={{ width: `${(d.count / max) * 100}%` }} />
                        <span className="count">{d.count}</span>
                    </li>
                ))}
            </ul>
            {pending > 0 && (
                <p className="muted" aria-live="polite">
                    Waiting for {pending} more {pending === 1 ? "card" : "cards"}…
                </p>
            )}
            {stats.outliers.length > 0 && (
                <p className="muted">Outliers highlighted: worth hearing their reasoning before deciding.</p>
            )}

            {canAccept && (
                <div className="row accept">
                    <label htmlFor="estimate">Final estimate</label>
                    <select id="estimate" value={estimate} onChange={e => setChoice(e.target.value)}>
                        {deck.cards
                            .filter(c => !c.special || c.label === "∞")
                            .map(c => (
                                <option key={c.label} value={c.label}>
                                    {c.label}
                                </option>
                            ))}
                    </select>
                    <button
                        type="button"
                        className="primary"
                        onClick={() => sync.dispatch({ type: "acceptEstimate", value: estimate })}
                    >
                        Save & next story
                    </button>
                </div>
            )}
        </section>
    );
};
