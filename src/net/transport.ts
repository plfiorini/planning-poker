import type { Intent, ParticipantInfo, RoomState } from "../domain/types";

/** Everything peers say to each other. */
export type WireMessage =
    /** Sent to every newly connected peer. `state` is null while the sender is still looking for a room. */
    | { t: "hello"; participant: ParticipantInfo; state: RoomState | null }
    /** Full state broadcast by the host after each change. Small enough that diffs aren't worth it. */
    | { t: "state"; state: RoomState }
    /**
     * Change request addressed to the host. `from` is the original sender's participant id: peers that
     * can't reach the host directly broadcast it, and peers that can forward it. `id` dedupes copies.
     */
    | { t: "intent"; id: string; from: string; intent: Intent }
    /** A peer's direct connections (participant ids), reported to the host so it knows who is reachable. */
    | { t: "peers"; ids: string[] };

export interface TransportHandlers {
    onMessage: (message: WireMessage, peerId: string) => void;
    onPeerJoin: (peerId: string) => void;
    onPeerLeave: (peerId: string) => void;
}

/**
 * Peer-to-peer message bus. The app only depends on this interface, so the WebRTC implementation
 * can be swapped for a WebSocket relay (e.g. a small Node server) without touching room logic.
 */
export interface Transport {
    setHandlers(handlers: TransportHandlers): void;
    /** Sends to one peer, or to all connected peers when `peerId` is omitted. */
    send(message: WireMessage, peerId?: string): void;
    leave(): void;
}

const MESSAGE_TYPES = new Set(["hello", "state", "intent", "peers"]);

/** Cheap guard against malformed payloads from other peers. */
export const isWireMessage = (data: unknown): data is WireMessage =>
    typeof data === "object" && data !== null && MESSAGE_TYPES.has((data as { t?: unknown }).t as string);
