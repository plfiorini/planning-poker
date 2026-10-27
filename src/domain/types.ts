export type Role = "voter" | "spectator";

export type DeckId = "fibonacci" | "modified-fibonacci" | "t-shirt" | "powers-of-2";

export interface Participant {
    id: string;
    name: string;
    role: Role;
    online: boolean;
    /** Whether this participant has picked a card in the current round. The value itself stays on their device. */
    voted: boolean;
}

export interface Story {
    id: string;
    title: string;
    estimate: string | null;
}

export interface Timer {
    id: string;
    durationSec: number;
}

export type Phase = "voting" | "revealed";

/**
 * The replicated room state. The host is the only writer; every other peer keeps a copy.
 * Must stay JSON-serializable because it is sent over the wire as-is.
 */
export interface RoomState {
    v: 1;
    /** Incremented by the host on every change. Used to pick the freshest replica when peers meet. */
    rev: number;
    hostId: string;
    /** Join order matters: on host loss the first online participant takes over. */
    participants: Participant[];
    /** Online participants the host can only reach through another peer (partial mesh). Peers relay to them. */
    indirect: string[];
    deckId: DeckId;
    round: number;
    phase: Phase;
    /** Revealed votes for the current round, keyed by participant id. Empty while voting. */
    votes: Record<string, string>;
    stories: Story[];
    currentStoryId: string | null;
    timer: Timer | null;
    autoReveal: boolean;
    /** SHA-256 of the room's admin key. Null for rooms without an admin, where everyone can run the session. */
    adminKeyHash: string | null;
    /** Participants who proved they hold the admin key. */
    admins: string[];
}

export interface ParticipantInfo {
    id: string;
    name: string;
    role: Role;
}

/** A change request. Peers send intents to the host, which applies them with `roomReducer`. */
export type Intent =
    | { type: "join"; participant: ParticipantInfo }
    | { type: "presence"; online: string[]; indirect: string[] }
    | { type: "setName"; name: string }
    | { type: "setRole"; role: Role }
    | { type: "setVoted"; voted: boolean }
    | { type: "revealVote"; round: number; value: string }
    | { type: "reveal" }
    | { type: "newRound" }
    | { type: "setDeck"; deckId: DeckId }
    | { type: "addStories"; stories: { id: string; title: string }[] }
    | { type: "removeStory"; storyId: string }
    | { type: "moveStory"; storyId: string; offset: -1 | 1 }
    | { type: "selectStory"; storyId: string }
    | { type: "acceptEstimate"; value: string }
    | { type: "startTimer"; timerId: string; durationSec: number }
    | { type: "stopTimer" }
    | { type: "setAutoReveal"; autoReveal: boolean }
    /** Sent by whoever holds the admin key. The host verifies it and turns it into `grantAdmin`. */
    | { type: "claimAdmin"; key: string }
    | { type: "grantAdmin"; participantId: string; keyHash: string };
