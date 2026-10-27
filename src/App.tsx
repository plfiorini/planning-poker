import { useEffect, useState } from "react";
import { loadProfile, type Profile, saveProfile } from "./state/identity";
import { parseRoomRef, roomHash } from "./state/roomLink";
import { storage } from "./state/storage";
import { Home } from "./ui/Home";
import { ProfileForm } from "./ui/ProfileForm";
import { RoomPage } from "./ui/RoomPage";

/** Opening an admin link stores its key on this device and swaps the URL for the participant link. */
const readHash = () => {
    const room = parseRoomRef(window.location.hash);
    if (room?.adminKey) {
        storage.saveAdminKey(room.roomId, room.adminKey);
        window.history.replaceState(null, "", roomHash(room));
    }
    return window.location.hash;
};

// Hash routing: GitHub Pages has no SPA fallback, and the room secret must stay in the fragment anyway.
const useHash = () => {
    const [hash, setHash] = useState(readHash);
    useEffect(() => {
        const onChange = () => setHash(readHash());
        window.addEventListener("hashchange", onChange);
        return () => window.removeEventListener("hashchange", onChange);
    }, []);
    return hash;
};

/** WebRTC encryption needs WebCrypto, which browsers only expose over HTTPS (or on localhost). */
const InsecurePage = () => {
    const httpsUrl = window.location.href.replace(/^http:/, "https:");
    return (
        <main className="home">
            <div className="panel">
                <h2>This page needs HTTPS</h2>
                <p className="muted">
                    Browsers only allow the encryption Planning Poker relies on over a secure connection. Open the HTTPS
                    address instead:
                </p>
                <p>
                    <a className="link" href={httpsUrl}>
                        {httpsUrl}
                    </a>
                </p>
                <p className="muted">
                    Developers: <code>localhost</code> works over plain HTTP. To test from other devices on your
                    network, run <code>pnpm dev:lan</code>.
                </p>
            </div>
        </main>
    );
};

export const App = () => {
    if (!window.isSecureContext) return <InsecurePage />;
    return <Router />;
};

const Router = () => {
    const hash = useHash();
    const room = parseRoomRef(hash);
    const [profile, setProfile] = useState<Profile | null>(loadProfile);
    const [joined, setJoined] = useState<string | null>(null);

    const updateProfile = (next: Profile) => {
        saveProfile(next);
        setProfile(next);
    };

    if (!room) return <Home />;

    const isAdmin = storage.loadAdminKey(room.roomId) !== null;
    const isNew = isAdmin && storage.wasCreatedHere(room.roomId);
    if (!profile || (joined !== room.roomId && !storage.hasJoined(room.roomId))) {
        return (
            <main className="home">
                <ProfileForm
                    initial={profile}
                    title={isNew ? "Your new room is ready" : isAdmin ? "Join as admin" : "Join the planning session"}
                    intro={
                        isNew
                            ? "You're the admin: you'll run the session and get the link to share with your team."
                            : isAdmin
                              ? "This browser holds the admin key for this room, so you'll run the session. To join as a regular participant, use a private window or another browser."
                              : "Enter your name so the team knows who's voting."
                    }
                    submitLabel={isNew ? "Open room" : "Join room"}
                    onSubmit={next => {
                        updateProfile(next);
                        storage.markJoined(room.roomId);
                        setJoined(room.roomId);
                    }}
                />
            </main>
        );
    }
    return (
        <RoomPage key={`${room.roomId}.${room.secret}`} room={room} profile={profile} onProfileChange={updateProfile} />
    );
};
