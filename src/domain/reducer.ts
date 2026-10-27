import type { Intent, Participant, RoomState, Story } from "./types";

export const createRoomState = (hostId: string): RoomState => ({
    v: 1,
    rev: 0,
    hostId,
    participants: [],
    indirect: [],
    deckId: "fibonacci",
    round: 1,
    phase: "voting",
    votes: {},
    stories: [],
    currentStoryId: null,
    timer: null,
    autoReveal: false,
    adminKeyHash: null,
    admins: [],
});

/** Sender id the host uses for its own bookkeeping. Never accepted from the network. */
export const SYSTEM_SENDER = "~system";

const SYSTEM_ONLY = new Set<Intent["type"]>(["presence", "grantAdmin"]);

/** Running the session is reserved to admins; voting and editing your own profile is open to everyone. */
const ADMIN_ONLY = new Set<Intent["type"]>([
    "reveal",
    "newRound",
    "setDeck",
    "addStories",
    "removeStory",
    "moveStory",
    "selectStory",
    "acceptEstimate",
    "startTimer",
    "stopTimer",
    "setAutoReveal",
]);

/** Rooms without an admin key let everyone run the session. */
export const canAdminister = (state: RoomState, participantId: string) =>
    state.adminKeyHash === null || state.admins.includes(participantId);

const newRound = (state: RoomState): RoomState => ({
    ...state,
    round: state.round + 1,
    phase: "voting",
    votes: {},
    timer: null,
    participants: state.participants.map(p => (p.voted ? { ...p, voted: false } : p)),
});

const updateParticipant = (state: RoomState, id: string, patch: Partial<Participant>): RoomState => ({
    ...state,
    participants: state.participants.map(p => (p.id === id ? { ...p, ...patch } : p)),
});

/** The next story still lacking an estimate, searching forward from `fromIndex` and wrapping around. */
const nextOpenStory = (stories: Story[], fromIndex: number): string | null => {
    for (let i = 0; i < stories.length; i++) {
        const story = stories[(fromIndex + i) % stories.length];
        if (story.estimate === null) return story.id;
    }
    return null;
};

/**
 * Pure state transition applied by the host. `from` is the participant id of the sender, or
 * `SYSTEM_SENDER` for the host's own bookkeeping. Returns the same reference when the intent is a
 * no-op (or not allowed) so callers can skip broadcasting.
 */
export const roomReducer = (state: RoomState, intent: Intent, from: string): RoomState => {
    const system = from === SYSTEM_SENDER;
    const sender = state.participants.find(p => p.id === from);
    if (SYSTEM_ONLY.has(intent.type) && !system) return state;
    if (!sender && !system && intent.type !== "join") return state;
    if (ADMIN_ONLY.has(intent.type) && !system && !canAdminister(state, from)) return state;

    switch (intent.type) {
        case "join": {
            const { id, name, role } = intent.participant;
            if (!sender) {
                return {
                    ...state,
                    participants: [...state.participants, { id, name, role, online: true, voted: false }],
                };
            }
            if (sender.name === name && sender.role === role && sender.online) return state;
            return updateParticipant(state, id, { name, role, online: true, voted: role === "voter" && sender.voted });
        }

        case "presence": {
            const online = new Set(intent.online);
            const indirect = [...new Set(intent.indirect)].filter(id => online.has(id)).sort();
            const sameIndirect = indirect.join() === state.indirect.join();
            if (sameIndirect && state.participants.every(p => p.online === online.has(p.id))) return state;
            return {
                ...state,
                indirect: sameIndirect ? state.indirect : indirect,
                participants: state.participants.map(p =>
                    p.online === online.has(p.id) ? p : { ...p, online: online.has(p.id) },
                ),
            };
        }

        case "setName": {
            const name = intent.name.trim();
            if (!name || name === sender?.name) return state;
            return updateParticipant(state, from, { name });
        }

        case "setRole": {
            if (intent.role === sender?.role) return state;
            const votes = { ...state.votes };
            delete votes[from];
            return { ...updateParticipant(state, from, { role: intent.role, voted: false }), votes };
        }

        case "setVoted":
            if (state.phase !== "voting" || sender?.role !== "voter" || sender.voted === intent.voted) return state;
            return updateParticipant(state, from, { voted: intent.voted });

        case "revealVote":
            if (
                state.phase !== "revealed" ||
                intent.round !== state.round ||
                !sender?.voted ||
                state.votes[from] === intent.value
            ) {
                return state;
            }
            return { ...state, votes: { ...state.votes, [from]: intent.value } };

        case "reveal":
            if (state.phase !== "voting") return state;
            return { ...state, phase: "revealed", timer: null };

        case "newRound":
            return newRound(state);

        case "setDeck":
            if (intent.deckId === state.deckId) return state;
            return newRound({ ...state, deckId: intent.deckId });

        case "addStories": {
            const added = intent.stories
                .map(s => ({ id: s.id, title: s.title.trim(), estimate: null }))
                .filter(s => s.title);
            if (!added.length) return state;
            return {
                ...state,
                stories: [...state.stories, ...added],
                currentStoryId: state.currentStoryId ?? added[0].id,
            };
        }

        case "removeStory": {
            const index = state.stories.findIndex(s => s.id === intent.storyId);
            if (index < 0) return state;
            const stories = state.stories.filter(s => s.id !== intent.storyId);
            if (state.currentStoryId !== intent.storyId) return { ...state, stories };
            return newRound({ ...state, stories, currentStoryId: nextOpenStory(stories, index) });
        }

        case "moveStory": {
            const index = state.stories.findIndex(s => s.id === intent.storyId);
            const target = index + intent.offset;
            if (index < 0 || target < 0 || target >= state.stories.length) return state;
            const stories = [...state.stories];
            [stories[index], stories[target]] = [stories[target], stories[index]];
            return { ...state, stories };
        }

        case "selectStory":
            if (intent.storyId === state.currentStoryId || !state.stories.some(s => s.id === intent.storyId)) {
                return state;
            }
            return newRound({ ...state, currentStoryId: intent.storyId });

        case "acceptEstimate": {
            const index = state.stories.findIndex(s => s.id === state.currentStoryId);
            if (index < 0) return state;
            const stories = state.stories.map((s, i) => (i === index ? { ...s, estimate: intent.value } : s));
            return newRound({ ...state, stories, currentStoryId: nextOpenStory(stories, index + 1) });
        }

        case "startTimer":
            if (state.phase !== "voting" || intent.durationSec <= 0) return state;
            return { ...state, timer: { id: intent.timerId, durationSec: intent.durationSec } };

        case "stopTimer":
            if (!state.timer) return state;
            return { ...state, timer: null };

        case "setAutoReveal":
            if (intent.autoReveal === state.autoReveal) return state;
            return { ...state, autoReveal: intent.autoReveal };

        case "claimAdmin":
            // Verified (asynchronously) by the host, which then applies grantAdmin.
            return state;

        case "grantAdmin": {
            const { participantId, keyHash } = intent;
            // The first key presented to a room without one becomes its admin key.
            if (state.adminKeyHash !== null && state.adminKeyHash !== keyHash) return state;
            if (state.adminKeyHash === keyHash && state.admins.includes(participantId)) return state;
            return { ...state, adminKeyHash: keyHash, admins: [...new Set([...state.admins, participantId])] };
        }
    }
};
