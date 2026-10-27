import { type JoinRoomConfig, type JsonValue, joinRoom, type TurnServerConfig } from "trystero";
import { recordJoinError, trackedPeerConnection } from "./diagnostics";
import type { Transport, TransportHandlers, WireMessage } from "./transport";

const list = (value: string | undefined) =>
    (value ?? "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

/** Optional TURN relay for peers behind strict NATs or corporate VPNs. Configured at build time. */
const turnConfig = (): TurnServerConfig[] | undefined => {
    const urls = list(import.meta.env.VITE_TURN_URLS);
    if (!urls.length) return undefined;
    return [{ urls, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }];
};

export const APP_ID = import.meta.env.VITE_APP_ID || "planning-poker-p2p-v1";

/**
 * WebRTC transport. Peers find each other through public Nostr relays (signaling only) and then
 * talk directly over encrypted data channels. The room password keeps relay operators from reading
 * the connection offers.
 */
export const createTrysteroTransport = (roomId: string, password: string): Transport => {
    const relayUrls = list(import.meta.env.VITE_NOSTR_RELAYS);
    const config: JoinRoomConfig = {
        appId: APP_ID,
        password,
        turnConfig: turnConfig(),
        rtcPolyfill: trackedPeerConnection(),
        ...(relayUrls.length ? { relayConfig: { urls: relayUrls } } : {}),
    };
    const room = joinRoom(config, roomId, { onJoinError: recordJoinError });
    const action = room.makeAction<JsonValue>("pp");
    let handlers: TransportHandlers | undefined;

    action.onMessage = (data, { peerId }) => handlers?.onMessage(data as unknown as WireMessage, peerId);

    return {
        setHandlers(next) {
            handlers = next;
            // Assigning onPeerJoin replays peers that connected before we were listening.
            room.onPeerJoin = peerId => handlers?.onPeerJoin(peerId);
            room.onPeerLeave = peerId => handlers?.onPeerLeave(peerId);
        },
        send(message, peerId) {
            action.send(message as unknown as JsonValue, peerId ? { target: peerId } : undefined).catch(error => {
                console.warn("planning-poker: send failed", error);
            });
        },
        leave() {
            handlers = undefined;
            void room.leave();
        },
    };
};
