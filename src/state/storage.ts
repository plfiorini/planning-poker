import type { RoomState } from "../domain/types";
import type { MyVote } from "../net/roomSync";

// Storage can be unavailable (private mode, blocked site data); everything here degrades to no-ops.
const read = <T>(store: () => Storage, key: string): T | null => {
    try {
        const raw = store().getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
};

const write = (store: () => Storage, key: string, value: unknown) => {
    try {
        if (value === null) store().removeItem(key);
        else store().setItem(key, JSON.stringify(value));
    } catch {
        // ignore
    }
};

const local = () => window.localStorage;
const session = () => window.sessionStorage;

export const storage = {
    read,
    write,
    local,
    session,

    loadRoom(roomId: string): RoomState | null {
        const state = read<RoomState>(local, `pp:room:${roomId}`);
        return state?.v === 1 ? state : null;
    },
    saveRoom(roomId: string, state: RoomState) {
        write(local, `pp:room:${roomId}`, state);
    },

    /** Remembered on this device, so the admin gets their rights back after closing the tab. */
    loadAdminKey(roomId: string): string | null {
        return read<string>(local, `pp:admin:${roomId}`);
    },
    saveAdminKey(roomId: string, key: string) {
        write(local, `pp:admin:${roomId}`, key);
    },

    /** Whether this tab just created the room, as opposed to reopening a room this browser is admin of. */
    wasCreatedHere(roomId: string): boolean {
        return read<boolean>(session, `pp:created:${roomId}`) === true;
    },
    markCreatedHere(roomId: string) {
        write(session, `pp:created:${roomId}`, true);
    },

    /** Whether this tab already went through the join screen for a room, so refreshes skip it. */
    hasJoined(roomId: string): boolean {
        return read<boolean>(session, `pp:joined:${roomId}`) === true;
    },
    markJoined(roomId: string) {
        write(session, `pp:joined:${roomId}`, true);
    },

    /** Per tab, so a refresh keeps the card you picked but other tabs don't see it. */
    loadVote(roomId: string): MyVote | null {
        return read<MyVote>(session, `pp:vote:${roomId}`);
    },
    saveVote(roomId: string, vote: MyVote | null) {
        write(session, `pp:vote:${roomId}`, vote);
    },
};
