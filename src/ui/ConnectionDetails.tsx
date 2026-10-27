import { useEffect, useState } from "react";
import { type Diagnostics, readDiagnostics } from "../net/diagnostics";

/** One-line reading of the diagnostics, pointing at the likely culprit. */
const verdict = ({ relays, connections, errors }: Diagnostics): string => {
    const open = relays.filter(r => r.state === "open").length;
    if (errors.some(e => e.includes("password"))) return "The room link looks incomplete or wrong: copy it again.";
    if (connections.some(c => c.state === "connected")) return "Connected directly to at least one person.";
    if (errors.some(e => e.includes("after exchanging SDP")) || connections.some(c => c.state === "failed"))
        return "Found the other browser, but the network blocked the direct connection. A TURN server fixes this (see the README).";
    if (connections.length) return "Found someone through the relays, now connecting directly…";
    if (relays.length && !open) return "Can't reach any signaling relay: the network may be blocking them.";
    if (open) return `Reached ${open} of ${relays.length} relays. Nobody else found in this room yet.`;
    return "Starting…";
};

export const ConnectionDetails = ({ open = false }: { open?: boolean }) => {
    const [diagnostics, setDiagnostics] = useState(readDiagnostics);
    useEffect(() => {
        const interval = setInterval(() => setDiagnostics(readDiagnostics()), 1000);
        return () => clearInterval(interval);
    }, []);
    const { relays, connections, errors } = diagnostics;

    return (
        <details className="diagnostics" open={open}>
            <summary>Connection details</summary>
            <p>{verdict(diagnostics)}</p>
            <h4>Signaling relays</h4>
            <ul>
                {relays.map(r => (
                    <li key={r.url}>
                        <span className={`dot ${r.state === "open" ? "ok" : "alone"}`} aria-hidden="true" />
                        {r.url.replace("wss://", "")} <span className="muted">{r.state}</span>
                    </li>
                ))}
            </ul>
            <h4>Direct connections</h4>
            {connections.length ? (
                <ul>
                    {connections.map((c, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: a read-only debug list, rebuilt every second
                        <li key={i}>
                            {c.state}{" "}
                            <span className="muted">
                                (ICE {c.ice}; candidates: {c.candidates.join(", ") || "none"})
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="muted">None attempted yet.</p>
            )}
            {errors.length > 0 && (
                <>
                    <h4>Errors</h4>
                    <ul>
                        {errors.map(e => (
                            <li key={e}>{e}</li>
                        ))}
                    </ul>
                </>
            )}
        </details>
    );
};
