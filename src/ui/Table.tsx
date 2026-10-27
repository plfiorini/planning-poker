import type { Participant, RoomState } from "../domain/types";

interface Props {
    state: RoomState;
    meId: string;
    outliers: string[];
}

const Seat = ({
    participant,
    state,
    isMe,
    outliers,
}: {
    participant: Participant;
    state: RoomState;
    isMe: boolean;
    outliers: string[];
}) => {
    const revealed = state.phase === "revealed";
    const value = state.votes[participant.id];
    let card: { className: string; text: string; label: string };
    if (revealed && value !== undefined) {
        card = {
            className: outliers.includes(value) ? "face up outlier" : "face up",
            text: value,
            label: `voted ${value}`,
        };
    } else if (revealed && participant.voted) {
        card = { className: "face pending", text: "…", label: "revealing" };
    } else if (participant.voted) {
        card = { className: "face down", text: "✓", label: "has voted" };
    } else {
        card = { className: "face empty", text: revealed ? "—" : "", label: revealed ? "did not vote" : "thinking" };
    }

    return (
        <li className={`seat ${participant.online ? "" : "offline"}`}>
            <div className={`card ${card.className}`} role="img" aria-label={`${participant.name} ${card.label}`}>
                {card.text}
            </div>
            <span className="name">
                {participant.name}
                {isMe && <span className="muted"> (you)</span>}
                {state.admins.includes(participant.id) && <span className="tag small">admin</span>}
            </span>
        </li>
    );
};

export const Table = ({ state, meId, outliers }: Props) => {
    // Offline participants stay in the list (join order picks the next host) but are only shown if they voted.
    const visible = state.participants.filter(p => p.online || state.votes[p.id] !== undefined);
    const voters = visible.filter(p => p.role === "voter");
    const spectators = visible.filter(p => p.role === "spectator");
    const votedCount = voters.filter(p => p.voted).length;

    return (
        <section className="table" aria-label="Participants">
            <p className="muted center">
                {state.phase === "voting" ? `${votedCount} of ${voters.length} voted` : "Cards revealed"}
            </p>
            <ul className="seats">
                {voters.map(p => (
                    <Seat key={p.id} participant={p} state={state} isMe={p.id === meId} outliers={outliers} />
                ))}
            </ul>
            {spectators.length > 0 && (
                <p className="muted center spectators">
                    Watching:{" "}
                    {spectators
                        .map(
                            p =>
                                p.name +
                                (state.admins.includes(p.id) ? " (admin)" : "") +
                                (p.id === meId ? " (you)" : ""),
                        )
                        .join(", ")}
                </p>
            )}
        </section>
    );
};
