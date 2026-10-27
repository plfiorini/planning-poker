import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Timer } from "../domain/types";
import { type RoomSnapshot, RoomSync } from "../net/roomSync";
import { createTrysteroTransport } from "../net/trysteroTransport";
import { getParticipantId, type Profile } from "./identity";
import type { RoomRef } from "./roomLink";
import { storage } from "./storage";

const EMPTY: RoomSnapshot = { state: null, isHost: false, myVote: null, peerCount: 0 };
const noopSubscribe = () => () => {};

/** Joins a room for the lifetime of the component and exposes its live state. */
export const useRoom = ({ roomId, secret }: RoomRef, profile: Profile) => {
    const [sync, setSync] = useState<RoomSync | null>(null);
    const profileRef = useRef(profile);
    profileRef.current = profile;

    useEffect(() => {
        const adminKey = storage.loadAdminKey(roomId);
        const roomSync = new RoomSync({
            transport: createTrysteroTransport(roomId, secret),
            me: { id: getParticipantId(), ...profileRef.current },
            restoredState: storage.loadRoom(roomId),
            restoredVote: storage.loadVote(roomId),
            adminKey,
            // Only the admin starts the room; a participant who can't reach it yet keeps looking.
            canCreateRoom: adminKey !== null,
        });
        const unsubscribe = roomSync.subscribe(() => {
            const { state, myVote } = roomSync.getSnapshot();
            if (state) storage.saveRoom(roomId, state);
            storage.saveVote(roomId, myVote);
        });
        // Say goodbye explicitly so peers hand over hosting right away instead of waiting for a timeout.
        const onPageHide = () => roomSync.destroy();
        // Coming back from the back/forward cache, the room connection is gone: start over.
        const onPageShow = (event: PageTransitionEvent) => event.persisted && window.location.reload();
        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("pageshow", onPageShow);
        roomSync.start();
        setSync(roomSync);
        return () => {
            window.removeEventListener("pagehide", onPageHide);
            window.removeEventListener("pageshow", onPageShow);
            unsubscribe();
            roomSync.destroy();
            setSync(null);
        };
    }, [roomId, secret]);

    // Push profile edits made while in the room.
    useEffect(() => {
        sync?.updateMe(profile);
    }, [sync, profile]);

    const snapshot = useSyncExternalStore(sync?.subscribe ?? noopSubscribe, sync?.getSnapshot ?? (() => EMPTY));
    return { ...snapshot, sync, participantId: getParticipantId() };
};

/** Seconds left on the round timer, counted from when this browser first saw it. */
export const useCountdown = (sync: RoomSync | null, timer: Timer | null): number | null => {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (!timer) return;
        const interval = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(interval);
    }, [timer]);
    if (!timer || !sync) return null;
    const startedAt = sync.timerStartedAt(timer.id) ?? now;
    return Math.max(0, Math.ceil((startedAt + timer.durationSec * 1000 - now) / 1000));
};
