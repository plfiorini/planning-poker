import { describe, expect, it } from "vitest";
import { canAdminister, createRoomState, roomReducer, SYSTEM_SENDER } from "./reducer";
import type { Intent, ParticipantInfo, RoomState } from "./types";

const alice: ParticipantInfo = { id: "a", name: "Alice", role: "voter" };
const bob: ParticipantInfo = { id: "b", name: "Bob", role: "voter" };
const sam: ParticipantInfo = { id: "s", name: "Sam", role: "spectator" };

const apply = (state: RoomState, ...steps: [string, Intent][]) =>
    steps.reduce((s, [from, intent]) => roomReducer(s, intent, from), state);

const roomWith = (...people: ParticipantInfo[]) =>
    apply(createRoomState("a"), ...people.map(p => [p.id, { type: "join", participant: p }] as [string, Intent]));

describe("roomReducer", () => {
    it("adds participants in join order and updates them in place on rejoin", () => {
        let s = roomWith(alice, bob);
        s = roomReducer(s, { type: "join", participant: { ...alice, name: "Alicia" } }, "a");
        expect(s.participants.map(p => p.name)).toEqual(["Alicia", "Bob"]);
        expect(s.participants.every(p => p.online)).toBe(true);
    });

    it("returns the same reference when nothing changes", () => {
        const s = roomWith(alice);
        expect(roomReducer(s, { type: "setAutoReveal", autoReveal: s.autoReveal }, "a")).toBe(s);
        expect(roomReducer(s, { type: "reveal" }, "unknown")).toBe(s);
    });

    it("tracks presence from the host's view of connected peers", () => {
        const presence = (online: string[], indirect: string[] = []): Intent => ({
            type: "presence",
            online,
            indirect,
        });
        let s = roomReducer(roomWith(alice, bob, sam), presence(["a", "s"]), SYSTEM_SENDER);
        expect(s.participants.find(p => p.id === "b")?.online).toBe(false);
        s = roomReducer(s, presence(["a", "b", "s"], ["b", "x"]), SYSTEM_SENDER);
        expect(s.indirect).toEqual(["b"]);
        expect(roomReducer(s, presence(["s", "b", "a"], ["b"]), SYSTEM_SENDER)).toBe(s);
        // Only the host's own bookkeeping may report presence.
        expect(roomReducer(s, presence(["a"]), "a")).toBe(s);
    });

    it("keeps vote values hidden until reveal and only accepts them for the current round", () => {
        let s = apply(
            roomWith(alice, bob, sam),
            ["a", { type: "setVoted", voted: true }],
            ["s", { type: "setVoted", voted: true }],
        );
        expect(s.participants.find(p => p.id === "a")?.voted).toBe(true);
        expect(s.participants.find(p => p.id === "s")?.voted).toBe(false);
        expect(roomReducer(s, { type: "revealVote", round: s.round, value: "5" }, "a")).toBe(s);

        s = roomReducer(s, { type: "reveal" }, "b");
        s = apply(
            s,
            ["a", { type: "revealVote", round: s.round, value: "5" }],
            ["b", { type: "revealVote", round: s.round, value: "8" }],
            ["a", { type: "revealVote", round: s.round - 1, value: "13" }],
        );
        expect(s.phase).toBe("revealed");
        expect(s.votes).toEqual({ a: "5" });
    });

    it("starts a clean round on newRound and deck change", () => {
        let s = apply(roomWith(alice), ["a", { type: "setVoted", voted: true }], ["a", { type: "reveal" }]);
        s = roomReducer(s, { type: "revealVote", round: s.round, value: "3" }, "a");
        const round = s.round;
        s = roomReducer(s, { type: "setDeck", deckId: "t-shirt" }, "a");
        expect(s).toMatchObject({ deckId: "t-shirt", round: round + 1, phase: "voting", votes: {}, timer: null });
        expect(s.participants[0].voted).toBe(false);
    });

    it("drops a pending vote when switching to spectator", () => {
        const s = apply(
            roomWith(alice),
            ["a", { type: "setVoted", voted: true }],
            ["a", { type: "setRole", role: "spectator" }],
        );
        expect(s.participants[0]).toMatchObject({ role: "spectator", voted: false });
    });

    it("manages the story queue and advances on accepted estimates", () => {
        let s = roomReducer(
            roomWith(alice),
            {
                type: "addStories",
                stories: [
                    { id: "1", title: "Login" },
                    { id: "2", title: "Logout" },
                    { id: "3", title: "Profile" },
                ],
            },
            "a",
        );
        expect(s.currentStoryId).toBe("1");

        s = roomReducer(s, { type: "moveStory", storyId: "3", offset: -1 }, "a");
        expect(s.stories.map(x => x.id)).toEqual(["1", "3", "2"]);

        const round = s.round;
        s = roomReducer(s, { type: "acceptEstimate", value: "5" }, "a");
        expect(s.stories[0].estimate).toBe("5");
        expect(s.currentStoryId).toBe("3");
        expect(s.round).toBe(round + 1);

        s = roomReducer(s, { type: "removeStory", storyId: "3" }, "a");
        expect(s.currentStoryId).toBe("2");

        s = roomReducer(s, { type: "acceptEstimate", value: "8" }, "a");
        expect(s.currentStoryId).toBeNull();
        expect(roomReducer(s, { type: "acceptEstimate", value: "1" }, "a")).toBe(s);
    });

    it("runs a timer only while voting and clears it on reveal", () => {
        let s = roomReducer(roomWith(alice), { type: "startTimer", timerId: "t1", durationSec: 60 }, "a");
        expect(s.timer).toEqual({ id: "t1", durationSec: 60 });
        s = roomReducer(s, { type: "reveal" }, "a");
        expect(s.timer).toBeNull();
        expect(roomReducer(s, { type: "startTimer", timerId: "t2", durationSec: 60 }, "a")).toBe(s);
    });

    describe("with an admin", () => {
        const grant = (participantId: string, keyHash = "hash-1"): Intent => ({
            type: "grantAdmin",
            participantId,
            keyHash,
        });
        const adminRoom = () => roomReducer(roomWith(alice, bob), grant("a"), SYSTEM_SENDER);

        it("registers the first key presented and only admits holders of the same key", () => {
            let s = adminRoom();
            expect(s).toMatchObject({ adminKeyHash: "hash-1", admins: ["a"] });
            expect(roomReducer(s, grant("b", "hash-2"), SYSTEM_SENDER)).toBe(s);
            s = roomReducer(s, grant("b"), SYSTEM_SENDER);
            expect(s.admins).toEqual(["a", "b"]);
        });

        it("ignores admin grants that don't come from the host itself", () => {
            const s = roomWith(alice, bob);
            expect(roomReducer(s, grant("b"), "b")).toBe(s);
        });

        it("reserves running the session to admins but lets everyone vote", () => {
            let s = adminRoom();
            expect(canAdminister(s, "a")).toBe(true);
            expect(canAdminister(s, "b")).toBe(false);
            for (const intent of [
                { type: "reveal" },
                { type: "setDeck", deckId: "t-shirt" },
                { type: "addStories", stories: [{ id: "1", title: "Sneaky" }] },
                { type: "startTimer", timerId: "t", durationSec: 30 },
            ] satisfies Intent[]) {
                expect(roomReducer(s, intent, "b")).toBe(s);
            }
            s = apply(s, ["b", { type: "setVoted", voted: true }], ["b", { type: "setName", name: "Robert" }]);
            expect(s.participants[1]).toMatchObject({ name: "Robert", voted: true });

            s = roomReducer(s, { type: "reveal" }, "a");
            expect(s.phase).toBe("revealed");
        });

        it("lets the host's own timer reveal even if the host isn't an admin", () => {
            const s = roomReducer(adminRoom(), { type: "reveal" }, SYSTEM_SENDER);
            expect(s.phase).toBe("revealed");
        });

        it("lets everyone run rooms that have no admin", () => {
            expect(canAdminister(roomWith(alice, bob), "b")).toBe(true);
        });
    });
});
