import type { Transport, TransportHandlers, WireMessage } from "./transport";

const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * In-memory network for tests. Peers link to every other online peer unless the pair is blocked,
 * which simulates NAT combinations that WebRTC can't traverse. Deliveries are queued and run by
 * `flush()`, mimicking the asynchronous, ordered delivery of WebRTC data channels.
 */
export class FakeNetwork {
    private readonly nodes = new Map<string, FakeTransport>();
    private readonly links = new Set<string>();
    private readonly blocked = new Set<string>();
    private readonly queue: (() => void)[] = [];
    /** Every message that went over the wire, for asserting on what peers could see. */
    readonly log: { from: string; to: string; message: WireMessage }[] = [];

    transport(peerId: string): FakeTransport {
        const node = new FakeTransport(this, peerId);
        this.nodes.set(peerId, node);
        return node;
    }

    /** Prevents two peers from ever connecting directly. */
    block(a: string, b: string) {
        this.blocked.add(pair(a, b));
    }

    /** Brings a peer online and links it to every reachable online peer. */
    connect(peerId: string) {
        const node = this.nodes.get(peerId);
        if (!node) throw new Error(`unknown peer ${peerId}`);
        node.online = true;
        for (const other of this.nodes.values()) {
            const key = pair(peerId, other.peerId);
            if (other === node || !other.online || this.blocked.has(key) || this.links.has(key)) continue;
            this.links.add(key);
            this.enqueue(() => other.handlers?.onPeerJoin(peerId));
            this.enqueue(() => node.handlers?.onPeerJoin(other.peerId));
        }
    }

    /** Drops the direct link between two online peers, as when a WebRTC connection fails. */
    cut(a: string, b: string) {
        this.block(a, b);
        if (!this.links.delete(pair(a, b))) return;
        this.enqueue(() => this.nodes.get(a)?.handlers?.onPeerLeave(b));
        this.enqueue(() => this.nodes.get(b)?.handlers?.onPeerLeave(a));
    }

    disconnect(peerId: string) {
        const node = this.nodes.get(peerId);
        if (!node?.online) return;
        node.online = false;
        for (const other of this.nodes.values()) {
            const key = pair(peerId, other.peerId);
            if (!this.links.delete(key)) continue;
            this.enqueue(() => other.handlers?.onPeerLeave(peerId));
        }
    }

    deliver(from: string, message: WireMessage, to?: string) {
        for (const node of this.nodes.values()) {
            if (!this.links.has(pair(from, node.peerId)) || (to && node.peerId !== to)) continue;
            const copy = structuredClone(message);
            this.log.push({ from, to: node.peerId, message: copy });
            this.enqueue(() => node.online && node.handlers?.onMessage(copy, from));
        }
    }

    flush() {
        for (let i = 0; i < 10_000 && this.queue.length; i++) this.queue.shift()?.();
        if (this.queue.length) throw new Error("network did not settle");
    }

    private enqueue(task: () => void) {
        this.queue.push(task);
    }
}

export class FakeTransport implements Transport {
    handlers: TransportHandlers | undefined;
    online = false;
    readonly peerId: string;
    private readonly network: FakeNetwork;

    constructor(network: FakeNetwork, peerId: string) {
        this.network = network;
        this.peerId = peerId;
    }

    setHandlers(handlers: TransportHandlers) {
        this.handlers = handlers;
    }

    send(message: WireMessage, peerId?: string) {
        this.network.deliver(this.peerId, message, peerId);
    }

    leave() {
        this.network.disconnect(this.peerId);
    }
}
