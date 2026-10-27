import { getRelaySockets, type JoinError } from "trystero";

/**
 * What the WebRTC transport is doing, for the "Connection details" panel. When people can't see each
 * other, this tells apart the two usual causes: the signaling relays are unreachable, or the browsers
 * found each other but the network blocked the direct connection (which a TURN server fixes).
 */
export interface Diagnostics {
    relays: { url: string; state: "connecting" | "open" | "closed" }[];
    connections: {
        state: RTCPeerConnectionState;
        ice: RTCIceConnectionState;
        /** Local ICE candidate types gathered: host (LAN), srflx (public address via STUN), relay (TURN). */
        candidates: string[];
    }[];
    errors: string[];
}

const SOCKET_STATES = ["connecting", "open", "closed", "closed"] as const;
const MAX_CONNECTIONS = 20;

const connections: { pc: RTCPeerConnection; candidates: Set<string> }[] = [];
const errors: string[] = [];

/** RTCPeerConnection that registers itself here; handed to Trystero as `rtcPolyfill`. */
export const trackedPeerConnection = (): typeof RTCPeerConnection =>
    class TrackedPeerConnection extends RTCPeerConnection {
        constructor(config?: RTCConfiguration) {
            super(config);
            const entry = { pc: this as RTCPeerConnection, candidates: new Set<string>() };
            this.addEventListener("icecandidate", event => {
                if (event.candidate?.type) entry.candidates.add(event.candidate.type);
            });
            connections.push(entry);
            if (connections.length > MAX_CONNECTIONS) connections.shift();
        }
    };

export const recordJoinError = ({ error }: JoinError) => {
    console.warn("planning-poker:", error);
    if (!errors.includes(error)) errors.push(error);
};

export const readDiagnostics = (): Diagnostics => {
    let sockets: Record<string, WebSocket> = {};
    try {
        sockets = getRelaySockets() as Record<string, WebSocket>;
    } catch {
        // Not initialized yet.
    }
    return {
        relays: Object.entries(sockets).map(([url, socket]) => ({ url, state: SOCKET_STATES[socket.readyState] })),
        connections: connections.map(({ pc, candidates }) => ({
            state: pc.connectionState,
            ice: pc.iceConnectionState,
            candidates: [...candidates].sort(),
        })),
        errors: [...errors],
    };
};
