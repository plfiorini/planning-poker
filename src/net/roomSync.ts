import { randomId } from "../domain/ids";
import { createRoomState, roomReducer, SYSTEM_SENDER } from "../domain/reducer";
import type { Intent, ParticipantInfo, RoomState } from "../domain/types";
import { isWireMessage, type Transport, type WireMessage } from "./transport";

export interface MyVote {
    round: number;
    value: string;
}

export interface RoomSnapshot {
    /** Null until we have found an existing room or decided to start one. */
    state: RoomState | null;
    isHost: boolean;
    myVote: MyVote | null;
    /** Number of peers we have a working connection to. */
    peerCount: number;
}

export interface RoomSyncOptions {
    transport: Transport;
    me: ParticipantInfo;
    /** Last state seen for this room on this device, used if nobody else is around. */
    restoredState?: RoomState | null;
    /** Our own vote from before a page refresh. */
    restoredVote?: MyVote | null;
    /** The room's admin key, if this device created the room or opened its admin link. */
    adminKey?: string | null;
    /**
     * Whether this peer may start the room when nobody else is around: true for the admin, false for
     * participants, who only ever join the admin's room and keep looking for it instead. Default true.
     */
    canCreateRoom?: boolean;
    /** How long to look for existing peers before hosting a room ourselves. */
    graceMs?: number;
    /** How long to wait for the expected successor of a departed host before taking over ourselves. */
    takeoverMs?: number;
}

/**
 * Which replica wins when two disagree: more changes applied wins, ties go to the lower host id.
 * Every peer evaluates this the same way, so they all converge on one state and one host.
 */
export const isNewer = (a: RoomState, b: RoomState) => a.rev > b.rev || (a.rev === b.rev && a.hostId < b.hostId);

const SEEN_INTENTS_LIMIT = 500;

/** Hex SHA-256 of the admin key. Only the hash is stored in the shared room state. */
export const hashAdminKey = async (key: string) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Keeps a replica of the room state in sync over a Transport.
 *
 * One peer, the host, applies intents with `roomReducer` and broadcasts the result. Everyone else
 * sends intents to the host. If the host leaves, the first online participant in join order takes
 * over from their replica. Vote values never leave the voter's device until reveal.
 *
 * WebRTC does not guarantee a full mesh (some NAT pairs can't connect), so peers report their
 * connections to the host, and peers that can reach the host relay state and intents for those that can't.
 */
export class RoomSync {
    private readonly options: RoomSyncOptions;
    private readonly transport: Transport;
    private me: ParticipantInfo;
    private state: RoomState | null = null;
    private myVote: MyVote | null;
    /** peerId → participantId, learned from hello messages. */
    private readonly peers = new Map<string, string>();
    /** Host only: each directly connected participant's own connections. */
    private readonly reports = new Map<string, string[]>();
    /** Participants we saw disconnect and who haven't said hello (or hosted) since. */
    private readonly departed = new Set<string>();
    private readonly seenIntents = new Set<string>();
    private readonly listeners = new Set<() => void>();
    private snapshot: RoomSnapshot;
    private graceTimer: ReturnType<typeof setTimeout> | undefined;
    private takeoverTimer: ReturnType<typeof setTimeout> | undefined;
    private autoRevealTimer: ReturnType<typeof setTimeout> | undefined;
    private timerSeen: { id: string; at: number } | null = null;
    /** Host we last presented our admin key to, so we claim once per host rather than on every update. */
    private adminClaimedWith: string | null = null;

    constructor(options: RoomSyncOptions) {
        this.options = options;
        this.transport = options.transport;
        this.me = options.me;
        this.myVote = options.restoredVote ?? null;
        this.snapshot = this.buildSnapshot();
    }

    start() {
        this.transport.setHandlers({
            onMessage: (data, peerId) => {
                if (isWireMessage(data)) this.handleMessage(data, peerId);
            },
            onPeerJoin: peerId => this.transport.send(this.hello(), peerId),
            onPeerLeave: peerId => this.handlePeerLeave(peerId),
        });
        this.graceTimer = setTimeout(() => {
            if (this.state) return;
            const restored = this.options.restoredState;
            // Revs from separate histories aren't comparable: restart ours so a stale copy from an
            // earlier session loses against a room that is live right now.
            if (restored) this.becomeHost({ ...restored, rev: 0 });
            else if (this.options.canCreateRoom ?? true) this.becomeHost(createRoomState(this.me.id));
        }, this.options.graceMs ?? 3000);
    }

    destroy() {
        clearTimeout(this.graceTimer);
        clearTimeout(this.takeoverTimer);
        clearTimeout(this.autoRevealTimer);
        this.listeners.clear();
        this.transport.leave();
    }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = () => this.snapshot;

    get isHost() {
        return this.state?.hostId === this.me.id;
    }

    dispatch(intent: Intent) {
        if (!this.state) return;
        if (this.isHost) {
            this.applyIntent(intent, this.me.id);
            return;
        }
        const message: WireMessage = { t: "intent", id: randomId(), from: this.me.id, intent };
        this.markSeen(message.id);
        // Without a direct line to the host, ask every peer to pass it on.
        this.transport.send(message, this.peerOf(this.state.hostId));
    }

    /** Picks a card (or clears it with null). Only the fact that we voted is shared before reveal. */
    vote(value: string | null) {
        if (this.state?.phase !== "voting") return;
        this.myVote = value === null ? null : { round: this.state.round, value };
        this.dispatch({ type: "setVoted", voted: value !== null });
        this.notify();
    }

    /** Updates our name or role, both locally and in the room. */
    updateMe(patch: Partial<Omit<ParticipantInfo, "id">>) {
        this.me = { ...this.me, ...patch };
        if (patch.name !== undefined) this.dispatch({ type: "setName", name: patch.name });
        if (patch.role !== undefined) this.dispatch({ type: "setRole", role: patch.role });
    }

    /** When the current timer was first seen locally, for rendering a countdown. */
    timerStartedAt(timerId: string): number | null {
        return this.timerSeen?.id === timerId ? this.timerSeen.at : null;
    }

    private hello(): WireMessage {
        return { t: "hello", participant: this.me, state: this.state };
    }

    private handleMessage(message: WireMessage, peerId: string) {
        switch (message.t) {
            case "hello":
                this.peers.set(peerId, message.participant.id);
                this.departed.delete(message.participant.id);
                if (message.state) this.receiveState(message.state, peerId);
                if (this.isHost) {
                    this.applyAsHost({ type: "join", participant: message.participant }, message.participant.id);
                    this.updatePresence();
                } else {
                    this.reportPeers();
                }
                this.notify();
                break;
            case "state":
                this.receiveState(message.state, peerId);
                break;
            case "intent":
                this.receiveIntent(message, peerId);
                break;
            case "peers": {
                const from = this.peers.get(peerId);
                if (!this.isHost || !from) break;
                this.reports.set(from, message.ids);
                this.updatePresence();
                break;
            }
        }
    }

    private receiveIntent(message: Extract<WireMessage, { t: "intent" }>, peerId: string) {
        if (!this.state || this.seenIntents.has(message.id) || message.from === SYSTEM_SENDER) return;
        this.markSeen(message.id);
        if (this.isHost) {
            this.applyIntent(message.intent, message.from);
            return;
        }
        // Relay one hop towards the host for a peer that can't reach it.
        const hostPeer = this.peerOf(this.state.hostId);
        if (hostPeer && hostPeer !== peerId) this.transport.send(message, hostPeer);
    }

    private handlePeerLeave(peerId: string) {
        const participantId = this.peers.get(peerId);
        this.peers.delete(peerId);
        // A refreshed tab may already be back under a new peer id.
        if (!participantId || this.peerOf(participantId)) {
            this.notify();
            return;
        }
        this.departed.add(participantId);
        if (this.isHost) {
            this.reports.delete(participantId);
            this.updatePresence();
        } else {
            this.reportPeers();
            if (participantId === this.state?.hostId) this.hostLost();
        }
        this.notify();
    }

    private receiveState(incoming: RoomState, peerId: string) {
        const current = this.state;
        if (current && !isNewer(incoming, current)) {
            // A rival host with an older replica: hand it ours so it can step down.
            if (this.isHost && incoming.hostId !== this.me.id)
                this.transport.send({ t: "state", state: current }, peerId);
            return;
        }

        clearTimeout(this.graceTimer);
        const hostChanged = incoming.hostId !== current?.hostId;
        this.setState(incoming);
        this.relayToIndirectPeers(incoming, peerId);

        if (incoming.hostId === this.me.id) {
            // We won a merge with our own replica; make sure it reflects who is here.
            this.applyAsHost({ type: "join", participant: this.me }, this.me.id);
            this.updatePresence();
            return;
        }
        if (hostChanged) {
            clearTimeout(this.takeoverTimer);
            this.reportPeers();
            // If only our link to the old host broke, it is still running: tell it to step down.
            const formerHostPeer = current && this.peerOf(current.hostId);
            if (formerHostPeer && formerHostPeer !== peerId) {
                this.transport.send({ t: "state", state: incoming }, formerHostPeer);
            }
        }
        // A newer state from a host we saw leave means only our link to it broke: it's alive and
        // reachable through others. Treating it as gone would make us fight over hosting forever.
        this.departed.delete(incoming.hostId);
        if (!incoming.participants.some(p => p.id === this.me.id)) {
            // The host may not hear our hello directly; ask to be added through the relay.
            this.dispatch({ type: "join", participant: this.me });
        }
    }

    private relayToIndirectPeers(state: RoomState, fromPeer: string) {
        if (this.isHost || !state.indirect.length) return;
        for (const [peerId, participantId] of this.peers) {
            if (peerId !== fromPeer && state.indirect.includes(participantId)) {
                this.transport.send({ t: "state", state }, peerId);
            }
        }
    }

    /**
     * The host is gone. Everyone agrees on the successor from the shared participant order;
     * if that successor doesn't show up in time (maybe it left too), we take over ourselves.
     */
    private hostLost() {
        const state = this.state;
        if (!state) return;
        const formerHost = state.hostId;
        const successor = state.participants.find(
            p =>
                p.id !== formerHost &&
                (p.id === this.me.id || this.peerOf(p.id) || (p.online && !this.departed.has(p.id))),
        );
        if (!successor || successor.id === this.me.id) {
            this.becomeHost(state);
            return;
        }
        clearTimeout(this.takeoverTimer);
        this.takeoverTimer = setTimeout(() => {
            if (this.state?.hostId === formerHost) this.becomeHost(this.state);
        }, this.options.takeoverMs ?? 5000);
    }

    private becomeHost(base: RoomState) {
        clearTimeout(this.graceTimer);
        clearTimeout(this.takeoverTimer);
        this.reports.clear();
        this.setState({ ...base, hostId: this.me.id, rev: base.rev + 1 });
        this.applyAsHost({ type: "join", participant: this.me }, this.me.id);
        this.updatePresence();
        this.broadcast();
    }

    /** Host only: applies a participant's intent, verifying admin claims first. */
    private applyIntent(intent: Intent, from: string) {
        if (intent.type !== "claimAdmin") {
            this.applyAsHost(intent, from);
            return;
        }
        void hashAdminKey(intent.key).then(keyHash => {
            if (this.isHost) this.applyAsHost({ type: "grantAdmin", participantId: from, keyHash }, SYSTEM_SENDER);
        });
    }

    private applyAsHost(intent: Intent, from: string) {
        const state = this.state;
        if (!state) return;
        const next = roomReducer(state, intent, from);
        if (next === state) return;
        this.setState({ ...next, rev: state.rev + 1 });
        this.broadcast();
    }

    /** Host only: online = us, our direct peers, and whoever our direct peers can reach. */
    private updatePresence() {
        const direct = new Set(this.peers.values());
        const online = new Set([this.me.id, ...direct]);
        for (const [reporter, ids] of this.reports) {
            if (direct.has(reporter)) for (const id of ids) online.add(id);
        }
        const indirect = [...online].filter(id => id !== this.me.id && !direct.has(id));
        this.applyAsHost({ type: "presence", online: [...online], indirect }, SYSTEM_SENDER);
    }

    private reportPeers() {
        const hostPeer = this.state && !this.isHost ? this.peerOf(this.state.hostId) : undefined;
        if (hostPeer) this.transport.send({ t: "peers", ids: [...new Set(this.peers.values())] }, hostPeer);
    }

    private broadcast() {
        if (this.state) this.transport.send({ t: "state", state: this.state });
    }

    private setState(state: RoomState) {
        this.state = state;
        this.trackTimer(state);
        this.notify();
        // Last, because they may dispatch and re-enter setState with a newer state.
        this.reconcileMyVote(state);
        this.reconcileAdmin(state);
    }

    /** Presents our admin key once we're in the room, and again if a new host takes over. */
    private reconcileAdmin(state: RoomState) {
        const key = this.options.adminKey;
        if (!key || this.state !== state || state.admins.includes(this.me.id)) return;
        if (!state.participants.some(p => p.id === this.me.id) || this.adminClaimedWith === state.hostId) return;
        this.adminClaimedWith = state.hostId;
        this.dispatch({ type: "claimAdmin", key });
    }

    /** Keeps the host's view of our vote in line with what we actually picked. */
    private reconcileMyVote(state: RoomState) {
        const self = state.participants.find(p => p.id === this.me.id);
        if (this.myVote && (this.myVote.round !== state.round || self?.role !== "voter")) this.myVote = null;
        if (!this.myVote || !self) return;

        if (state.phase === "voting" && !self.voted) {
            this.dispatch({ type: "setVoted", voted: true });
        } else if (state.phase === "revealed" && self.voted && state.votes[self.id] !== this.myVote.value) {
            this.dispatch({ type: "revealVote", round: this.myVote.round, value: this.myVote.value });
        }
    }

    /** Counts the timer down from when this peer first saw it, so clock skew between peers doesn't matter. */
    private trackTimer(state: RoomState) {
        if (state.timer?.id !== this.timerSeen?.id) {
            this.timerSeen = state.timer ? { id: state.timer.id, at: Date.now() } : null;
        }
        clearTimeout(this.autoRevealTimer);
        const timer = state.timer;
        if (!timer || !this.timerSeen || !state.autoReveal || state.phase !== "voting" || !this.isHost) return;
        const remaining = this.timerSeen.at + timer.durationSec * 1000 - Date.now();
        this.autoRevealTimer = setTimeout(
            () => {
                if (this.state?.timer?.id === timer.id) this.applyAsHost({ type: "reveal" }, SYSTEM_SENDER);
            },
            Math.max(0, remaining),
        );
    }

    private markSeen(id: string) {
        this.seenIntents.add(id);
        if (this.seenIntents.size > SEEN_INTENTS_LIMIT) {
            const oldest = this.seenIntents.values().next().value;
            if (oldest !== undefined) this.seenIntents.delete(oldest);
        }
    }

    private peerOf(participantId: string) {
        for (const [peerId, id] of this.peers) if (id === participantId) return peerId;
        return undefined;
    }

    private buildSnapshot(): RoomSnapshot {
        return {
            state: this.state,
            isHost: this.isHost,
            myVote: this.myVote,
            peerCount: new Set(this.peers.values()).size,
        };
    }

    private notify() {
        this.snapshot = this.buildSnapshot();
        for (const listener of this.listeners) listener();
    }
}
