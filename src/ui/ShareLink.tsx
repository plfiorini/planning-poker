import { useState } from "react";
import { type RoomRef, roomUrl } from "../state/roomLink";

const CopyButton = ({ url, label, primary }: { url: string; label: string; primary?: boolean }) => {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            window.prompt("Copy this link", url);
        }
    };
    return (
        <button type="button" className={`wide ${primary ? "primary" : ""}`} onClick={copy}>
            {copied ? "Copied!" : label}
        </button>
    );
};

export const ShareLink = ({ room, adminKey }: { room: RoomRef; adminKey: string | null }) => (
    <section className="panel share">
        <h3>Invite your team</h3>
        <p className="muted">Send this link to participants. Anyone who has it can join and vote.</p>
        <CopyButton url={roomUrl(room)} label="Copy participant link" primary />
        {adminKey && (
            <details className="admin-link">
                <summary>Your admin link</summary>
                <p className="muted">
                    Keep this one private. Open it on another device or browser to run the session from there. This
                    browser remembers you as admin automatically.
                </p>
                <CopyButton url={roomUrl(room, adminKey)} label="Copy admin link" />
            </details>
        )}
    </section>
);
