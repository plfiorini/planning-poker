import { randomToken } from "../domain/ids";

export interface RoomRef {
    roomId: string;
    /** Shared secret that encrypts signaling. Lives only in the URL fragment, which browsers never send to servers. */
    secret: string;
}

/** A new room plus the admin key that lets its creator run the session. */
export const newRoom = (): { room: RoomRef; adminKey: string } => ({
    room: { roomId: randomToken(9), secret: randomToken(18) },
    adminKey: randomToken(18),
});

/** Participant link. The admin link adds the admin key as a third segment. */
export const roomHash = ({ roomId, secret }: RoomRef, adminKey?: string) =>
    `#/room/${roomId}.${secret}${adminKey ? `.${adminKey}` : ""}`;

export const roomUrl = (room: RoomRef, adminKey?: string) =>
    `${window.location.origin}${window.location.pathname}${window.location.search}${roomHash(room, adminKey)}`;

/** Accepts a full room link, a `#/room/...` hash, or just the code after `#/room/`. */
export const parseRoomRef = (input: string): (RoomRef & { adminKey?: string }) | null => {
    const match = input.trim().match(/(?:^|#\/room\/)([\w-]{6,})\.([\w-]{16,})(?:\.([\w-]{16,}))?$/);
    if (!match) return null;
    return { roomId: match[1], secret: match[2], ...(match[3] ? { adminKey: match[3] } : {}) };
};
