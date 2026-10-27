import { useEffect, useMemo, useState } from "react";
import { DECKS } from "../domain/decks";
import { canAdminister } from "../domain/reducer";
import { computeStats } from "../domain/stats";
import type { Profile } from "../state/identity";
import type { RoomRef } from "../state/roomLink";
import { storage } from "../state/storage";
import { useRoom } from "../state/useRoom";
import { CardHand } from "./CardHand";
import { ConnectionDetails } from "./ConnectionDetails";
import { Controls } from "./Controls";
import { ProfileForm } from "./ProfileForm";
import { Results } from "./Results";
import { ShareLink } from "./ShareLink";
import { StoryQueue } from "./StoryQueue";
import { Table } from "./Table";

interface Props {
    room: RoomRef;
    profile: Profile;
    onProfileChange: (profile: Profile) => void;
}

const SLOW_CONNECT_MS = 15_000;

/** Shown until we reach the room. Only the admin's browser opens a new room; participants wait for it. */
const Connecting = ({ isAdmin }: { isAdmin: boolean }) => {
    const [slow, setSlow] = useState(false);
    useEffect(() => {
        const timeout = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
        return () => clearTimeout(timeout);
    }, []);
    return (
        <main className="home">
            <div className="panel connecting" aria-live="polite">
                <div className="spinner" aria-hidden="true" />
                <p>{isAdmin ? "Looking for your team…" : "Connecting to the room…"}</p>
                <p className="muted">
                    {isAdmin
                        ? "If nobody is here yet, your room will open in a few seconds."
                        : "You'll be in as soon as you reach someone who's already in the room."}
                </p>
                {slow && !isAdmin && (
                    <p className="muted hint">
                        This is taking a while. Check that the admin still has the room open. Company networks and VPNs
                        sometimes block browser-to-browser connections; if it never connects, see the README's TURN
                        section.
                    </p>
                )}
            </div>
            <ConnectionDetails open={slow} />
        </main>
    );
};

export const RoomPage = ({ room, profile, onProfileChange }: Props) => {
    const { state, isHost, myVote, peerCount, sync, participantId } = useRoom(room, profile);
    const [editingProfile, setEditingProfile] = useState(false);

    const voterVotes = useMemo(() => {
        if (!state) return [];
        return state.participants
            .filter(p => p.role === "voter" && state.votes[p.id] !== undefined)
            .map(p => state.votes[p.id]);
    }, [state]);

    if (!state || !sync) return <Connecting isAdmin={storage.loadAdminKey(room.roomId) !== null} />;

    const deck = DECKS[state.deckId];
    const stats = state.phase === "revealed" ? computeStats(deck, voterVotes) : null;
    // Voters' cards arrive one by one after reveal; offline voters' cards are lost.
    const pending = state.participants.filter(
        p => p.role === "voter" && p.online && p.voted && state.votes[p.id] === undefined,
    ).length;
    const me = state.participants.find(p => p.id === participantId);
    const currentStory = state.stories.find(s => s.id === state.currentStoryId) ?? null;
    const online = state.participants.filter(p => p.online).length;
    const isAdmin = canAdminister(state, participantId);
    const hasAdmin = state.adminKeyHash !== null;
    const adminAway = hasAdmin && !state.participants.some(p => p.online && state.admins.includes(p.id));
    const relayed = state.indirect.includes(participantId);

    return (
        <div className="room">
            <header className="topbar">
                <a href="#/" className="brand">
                    <span aria-hidden="true">🃏</span> Planning Poker
                </a>
                <div
                    className="status"
                    title={`Direct connections: ${peerCount}${isHost ? " · keeping the room state" : ""}`}
                >
                    <span className={`dot ${online > 1 ? "ok" : "alone"}`} aria-hidden="true" />
                    {online > 1 ? `${online} people here` : "Only you so far"}
                    {relayed && <span className="muted">· via relay</span>}
                    {isAdmin && hasAdmin && <span className="tag">admin</span>}
                </div>
                <button type="button" className="ghost" onClick={() => setEditingProfile(true)}>
                    {profile.name} · {profile.role === "voter" ? "voter" : "spectator"}
                </button>
            </header>

            <main className="board">
                <section className="story-banner" aria-label="Current story">
                    {currentStory ? (
                        <>
                            <span className="muted">Estimating</span>
                            <h2>{currentStory.title}</h2>
                        </>
                    ) : (
                        <h2 className="muted">
                            {isAdmin ? "Free voting: add stories to the queue to track estimates" : "Free voting"}
                        </h2>
                    )}
                </section>

                <Table state={state} meId={participantId} outliers={stats?.outliers ?? []} />

                <Controls state={state} sync={sync} canControl={isAdmin} adminAway={adminAway} />

                {stats && (
                    <Results
                        stats={stats}
                        pending={pending}
                        deck={deck}
                        canAccept={currentStory !== null && isAdmin}
                        sync={sync}
                    />
                )}

                {me?.role === "voter" ? (
                    <CardHand
                        deck={deck}
                        round={state.round}
                        selected={myVote?.round === state.round ? myVote.value : null}
                        disabled={state.phase !== "voting"}
                        onSelect={value => sync.vote(value)}
                    />
                ) : (
                    <p className="muted center">
                        {isAdmin ? "You're running this session as a spectator." : "You're watching without voting."}
                    </p>
                )}
            </main>

            <aside className="sidebar">
                <ShareLink room={room} adminKey={isAdmin ? storage.loadAdminKey(room.roomId) : null} />
                {online <= 1 && (
                    <section className="panel">
                        <ConnectionDetails />
                    </section>
                )}
                <StoryQueue state={state} sync={sync} canEdit={isAdmin} />
            </aside>

            {editingProfile && (
                <div className="modal" role="dialog" aria-modal="true">
                    <ProfileForm
                        initial={profile}
                        title="Your profile"
                        submitLabel="Save"
                        onCancel={() => setEditingProfile(false)}
                        onSubmit={next => {
                            onProfileChange(next);
                            setEditingProfile(false);
                        }}
                    />
                </div>
            )}
        </div>
    );
};
