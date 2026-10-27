import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_SENDER } from "../domain/reducer";
import type { ParticipantInfo, RoomState } from "../domain/types";
import { FakeNetwork } from "./fakeNetwork";
import { hashAdminKey, type MyVote, RoomSync } from "./roomSync";

const GRACE = 1000;

let net: FakeNetwork;
let peerSeq = 0;

/** Starts a peer and connects it to the network. Each call gets a fresh peer id, like a page load. */
const join = (
    info: Partial<ParticipantInfo> & { id: string },
    restored: {
        state?: RoomState;
        vote?: MyVote;
        unreachable?: { peerId: string }[];
        adminKey?: string;
        canCreateRoom?: boolean;
    } = {},
) => {
    const transport = net.transport(`peer-${++peerSeq}`);
    for (const other of restored.unreachable ?? []) net.block(transport.peerId, other.peerId);
    const sync = new RoomSync({
        transport,
        me: { name: info.id.toUpperCase(), role: "voter", ...info },
        restoredState: restored.state,
        restoredVote: restored.vote,
        adminKey: restored.adminKey,
        canCreateRoom: restored.canCreateRoom,
        graceMs: GRACE,
    });
    sync.start();
    net.connect(transport.peerId);
    net.flush();
    return Object.assign(sync, { peerId: transport.peerId });
};

const settle = () => {
    net.flush();
    vi.advanceTimersByTime(GRACE);
    net.flush();
};

/** Admin keys are verified with async WebCrypto, so let both the network and promises settle. */
const eventually = (check: () => void) =>
    vi.waitFor(() => {
        net.flush();
        check();
    });

const stateOf = (sync: RoomSync) => {
    const state = sync.getSnapshot().state;
    if (!state) throw new Error("no state yet");
    return state;
};

beforeEach(() => {
    vi.useFakeTimers();
    net = new FakeNetwork();
});

afterEach(() => vi.useRealTimers());

describe("RoomSync", () => {
    it("hosts a fresh room when nobody else is around", () => {
        const a = join({ id: "a" });
        expect(a.getSnapshot().state).toBeNull();
        settle();
        expect(a.isHost).toBe(true);
        expect(stateOf(a).participants.map(p => p.id)).toEqual(["a"]);
    });

    it("keeps a participant looking for the admin's room instead of starting one", () => {
        const guest = join({ id: "g" }, { canCreateRoom: false });
        vi.advanceTimersByTime(GRACE * 30);
        net.flush();
        expect(guest.getSnapshot().state).toBeNull();

        const admin = join({ id: "a" });
        settle();
        expect(admin.isHost).toBe(true);
        expect(stateOf(guest)).toEqual(stateOf(admin));
        expect(
            stateOf(admin)
                .participants.map(p => p.id)
                .sort(),
        ).toEqual(["a", "g"]);
    });

    it("lets a participant who was in the room before reopen it from storage", () => {
        const a = join({ id: "a" });
        settle();
        a.dispatch({ type: "addStories", stories: [{ id: "s1", title: "Login" }] });
        const saved = stateOf(a);
        net.disconnect(a.peerId);

        const guest = join({ id: "g" }, { canCreateRoom: false, state: saved });
        settle();
        expect(guest.isHost).toBe(true);
        expect(stateOf(guest).stories[0].title).toBe("Login");
    });

    it("gives a late joiner the current state and applies their intents", () => {
        const a = join({ id: "a" });
        settle();
        a.dispatch({ type: "addStories", stories: [{ id: "s1", title: "Login" }] });

        const b = join({ id: "b" });
        expect(b.isHost).toBe(false);
        expect(stateOf(b).stories[0].title).toBe("Login");

        b.dispatch({ type: "setDeck", deckId: "t-shirt" });
        net.flush();
        expect(stateOf(a).deckId).toBe("t-shirt");
        expect(stateOf(b)).toEqual(stateOf(a));
        expect(stateOf(a).participants.map(p => p.id)).toEqual(["a", "b"]);

        // The grace timer must not make the joiner start a rival room.
        settle();
        expect(b.isHost).toBe(false);
    });

    it("never sends vote values before the reveal", () => {
        const a = join({ id: "a" });
        settle();
        const b = join({ id: "b" });
        const c = join({ id: "c", role: "spectator" });

        a.vote("5");
        b.vote("13");
        net.flush();
        expect(
            stateOf(c)
                .participants.filter(p => p.voted)
                .map(p => p.id),
        ).toEqual(["a", "b"]);
        expect(JSON.stringify(net.log)).not.toContain('"13"');
        expect(stateOf(c).votes).toEqual({});

        c.dispatch({ type: "reveal" });
        net.flush();
        expect(stateOf(c)).toMatchObject({ phase: "revealed", votes: { a: "5", b: "13" } });
    });

    it("hands hosting to the earliest remaining participant without losing state", () => {
        const a = join({ id: "z-first" });
        settle();
        const b = join({ id: "y-second" });
        const c = join({ id: "x-third" });
        a.dispatch({ type: "addStories", stories: [{ id: "s1", title: "Search" }] });
        b.vote("8");
        net.flush();

        net.disconnect(a.peerId);
        net.flush();
        expect(b.isHost).toBe(true);
        expect(c.isHost).toBe(false);
        expect(stateOf(c).hostId).toBe("y-second");
        expect(stateOf(c).stories).toHaveLength(1);
        expect(stateOf(c).participants.find(p => p.id === "z-first")?.online).toBe(false);

        c.dispatch({ type: "reveal" });
        net.flush();
        expect(stateOf(c).votes).toEqual({ "y-second": "8" });
    });

    it("lets a refreshed participant reclaim their seat and their pending vote", () => {
        const a = join({ id: "a" });
        settle();
        const b = join({ id: "b" });
        b.vote("3");
        net.flush();
        const round = stateOf(a).round;

        net.disconnect(b.peerId);
        const b2 = join({ id: "b" }, { vote: { round, value: "3" } });
        net.flush();
        expect(stateOf(a).participants.map(p => [p.id, p.online, p.voted])).toEqual([
            ["a", true, false],
            ["b", true, true],
        ]);

        a.dispatch({ type: "reveal" });
        net.flush();
        expect(stateOf(b2).votes).toEqual({ b: "3" });
    });

    it("converges when two peers started separate rooms at the same time", () => {
        const a = net.transport("pa");
        const b = net.transport("pb");
        const syncA = new RoomSync({ transport: a, me: { id: "a", name: "A", role: "voter" }, graceMs: GRACE });
        const syncB = new RoomSync({ transport: b, me: { id: "b", name: "B", role: "voter" }, graceMs: GRACE });
        syncA.start();
        syncB.start();
        vi.advanceTimersByTime(GRACE);
        expect(syncA.isHost && syncB.isHost).toBe(true);

        net.connect("pa");
        net.connect("pb");
        net.flush();
        expect([syncA.isHost, syncB.isHost]).toEqual([true, false]);
        expect(stateOf(syncB)).toEqual(stateOf(syncA));
        expect(
            stateOf(syncA)
                .participants.map(p => p.id)
                .sort(),
        ).toEqual(["a", "b"]);
    });

    it("does not let a stale room restored from storage overwrite the live one", () => {
        const a = join({ id: "a" });
        settle();
        a.dispatch({ type: "addStories", stories: [{ id: "today", title: "Today's story" }] });
        net.flush();

        // Yesterday's copy of the room, with many more changes than today's.
        const yesterday = {
            ...stateOf(a),
            rev: 500,
            hostId: "b",
            stories: [{ id: "old", title: "Yesterday's story", estimate: "3" }],
            currentStoryId: null,
        };
        const transport = net.transport("late-peer");
        const b = new RoomSync({
            transport,
            me: { id: "b", name: "B", role: "voter" },
            restoredState: yesterday,
            graceMs: GRACE,
        });
        b.start();
        // Signaling was slow, so b gave up waiting and reopened its restored copy.
        vi.advanceTimersByTime(GRACE);
        expect(b.isHost).toBe(true);

        net.connect("late-peer");
        net.flush();
        expect(stateOf(b).stories.map(s => s.id)).toEqual(["today"]);
        expect(stateOf(a).stories.map(s => s.id)).toEqual(["today"]);
        expect([a.isHost, b.isHost]).toEqual([true, false]);
    });

    it("reveals automatically when the host's timer runs out", () => {
        join({ id: "a" });
        settle();
        const b = join({ id: "b" });
        b.dispatch({ type: "setAutoReveal", autoReveal: true });
        b.dispatch({ type: "startTimer", timerId: "t1", durationSec: 30 });
        net.flush();
        expect(stateOf(b).timer?.durationSec).toBe(30);

        vi.advanceTimersByTime(29_000);
        expect(stateOf(b).phase).toBe("voting");
        vi.advanceTimersByTime(1_000);
        net.flush();
        expect(stateOf(b)).toMatchObject({ phase: "revealed", timer: null });
    });

    describe("with a partial mesh", () => {
        it("relays state and intents for a peer that can't reach the host", () => {
            const a = join({ id: "a" });
            settle();
            const c = join({ id: "c" });
            const d = join({ id: "d" });
            const b = join({ id: "b" }, { unreachable: [a] });
            settle();

            expect([a, b, c, d].filter(x => x.isHost)).toEqual([a]);
            expect(stateOf(a).participants.find(p => p.id === "b")?.online).toBe(true);
            expect(stateOf(a).indirect).toEqual(["b"]);
            expect(stateOf(b)).toEqual(stateOf(a));

            // Relayed by both c and d: the host must apply it once.
            b.dispatch({ type: "addStories", stories: [{ id: "s1", title: "Billing" }] });
            b.vote("8");
            net.flush();
            expect(stateOf(a).stories).toHaveLength(1);
            expect(stateOf(b).stories).toHaveLength(1);

            a.dispatch({ type: "reveal" });
            net.flush();
            expect(stateOf(b).votes).toEqual({ b: "8" });
        });

        it("converges when only the link between the host and one peer breaks", () => {
            const a = join({ id: "a" });
            settle();
            const b = join({ id: "b" });
            const c = join({ id: "c" });
            a.dispatch({ type: "addStories", stories: [{ id: "s1", title: "Export" }] });
            net.flush();

            net.cut(a.peerId, b.peerId);
            net.flush();
            // b saw its host vanish and took over; a must step down instead of running a rival room.
            expect([a, b, c].filter(x => x.isHost)).toEqual([b]);
            expect(stateOf(a)).toEqual(stateOf(b));
            expect(stateOf(b).indirect).toEqual(["a"]);

            a.dispatch({ type: "setDeck", deckId: "powers-of-2" });
            net.flush();
            expect(stateOf(b).deckId).toBe("powers-of-2");
            expect(stateOf(a).stories).toHaveLength(1);
        });

        it("takes over when the expected successor left at the same time as the host", () => {
            const a = join({ id: "a" });
            settle();
            const b = join({ id: "b" });
            const c = join({ id: "c" }, { unreachable: [b] });
            const d = join({ id: "d" });
            settle();

            net.disconnect(a.peerId);
            net.disconnect(b.peerId);
            net.flush();
            // c and d both expect b (next in join order) to take over, but c can't see that b is gone.
            expect([c.isHost, d.isHost]).toEqual([false, false]);

            vi.advanceTimersByTime(5000);
            net.flush();
            expect([c, d].filter(x => x.isHost)).toHaveLength(1);
            expect(stateOf(c)).toEqual(stateOf(d));
            expect(
                stateOf(d)
                    .participants.filter(p => p.online)
                    .map(p => p.id),
            ).toEqual(["c", "d"]);
        });
    });

    describe("admin", () => {
        it("grants admin rights to the key holder and enforces them for everyone else", async () => {
            const a = join({ id: "a" }, { adminKey: "secret-admin-key" });
            settle();
            const b = join({ id: "b" });
            const c = join({ id: "c" }, { adminKey: "wrong-key" });
            await eventually(() => expect(stateOf(b).admins).toEqual(["a"]));
            expect(stateOf(b).adminKeyHash).toBe(await hashAdminKey("secret-admin-key"));

            b.vote("5");
            b.dispatch({ type: "reveal" });
            c.dispatch({ type: "reveal" });
            net.flush();
            expect(stateOf(a).phase).toBe("voting");
            expect(stateOf(a).participants.find(p => p.id === "b")?.voted).toBe(true);

            a.dispatch({ type: "reveal" });
            net.flush();
            expect(stateOf(b)).toMatchObject({ phase: "revealed", votes: { b: "5" } });
            expect(stateOf(c).admins).toEqual(["a"]);
        });

        it("lets the admin link restore rights from another tab or device", async () => {
            const a = join({ id: "a" }, { adminKey: "k" });
            settle();
            const b = join({ id: "b" });
            await eventually(() => expect(stateOf(b).admins).toEqual(["a"]));

            net.disconnect(a.peerId);
            net.flush();
            expect(b.isHost).toBe(true);
            b.dispatch({ type: "newRound" });
            const round = stateOf(b).round;
            net.flush();
            expect(stateOf(b).round).toBe(round);

            // Same key, new participant id: a fresh tab opened from the admin link.
            const a2 = join({ id: "a2" }, { adminKey: "k" });
            await eventually(() => expect(stateOf(b).admins).toEqual(["a", "a2"]));
            a2.dispatch({ type: "newRound" });
            net.flush();
            expect(stateOf(b).round).toBe(round + 1);
        });

        it("ignores host-only intents smuggled in from the network", async () => {
            const a = join({ id: "a" }, { adminKey: "k" });
            settle();
            const b = join({ id: "b" });
            await eventually(() => expect(stateOf(b).admins).toEqual(["a"]));
            const keyHash = stateOf(b).adminKeyHash ?? "";

            const send = (from: string) =>
                net.deliver(b.peerId, {
                    t: "intent",
                    id: crypto.randomUUID(),
                    from,
                    intent: { type: "grantAdmin", participantId: "b", keyHash },
                });
            send(SYSTEM_SENDER);
            send("b");
            net.flush();
            expect(stateOf(a).admins).toEqual(["a"]);
        });
    });
});
