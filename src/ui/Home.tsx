import { type FormEvent, useState } from "react";
import { newRoom, parseRoomRef, roomHash } from "../state/roomLink";
import { storage } from "../state/storage";

const createRoom = () => {
    const { room, adminKey } = newRoom();
    // The key stays on this device; the address bar only ever shows the participant link.
    storage.saveAdminKey(room.roomId, adminKey);
    storage.markCreatedHere(room.roomId);
    window.location.hash = roomHash(room);
};

export const Home = () => {
    const [link, setLink] = useState("");
    const [error, setError] = useState(false);

    const join = (event: FormEvent) => {
        event.preventDefault();
        const room = parseRoomRef(link);
        if (room) window.location.hash = roomHash(room, room.adminKey);
        else setError(true);
    };

    return (
        <main className="home">
            <h1>
                <span aria-hidden="true">🃏</span> Planning Poker
            </h1>
            <p className="lead">
                Estimate together, from anywhere. Free, open source and peer-to-peer: your votes go straight between
                browsers, with no account and no server storing your data.
            </p>

            <button type="button" className="primary big" onClick={createRoom}>
                Create a room
            </button>

            <form className="join" onSubmit={join}>
                <label htmlFor="room-link">Or paste a room link</label>
                <div className="row">
                    <input
                        id="room-link"
                        value={link}
                        onChange={e => {
                            setLink(e.target.value);
                            setError(false);
                        }}
                        placeholder="https://…/#/room/…"
                        aria-invalid={error}
                    />
                    <button type="submit">Join</button>
                </div>
                {error && <p className="error">That doesn't look like a room link.</p>}
            </form>
        </main>
    );
};
