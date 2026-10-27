import { type FormEvent, type ReactNode, useState } from "react";
import type { Role } from "../domain/types";
import type { Profile } from "../state/identity";

interface Props {
    initial?: Profile | null;
    title: string;
    intro?: ReactNode;
    submitLabel: string;
    onSubmit: (profile: Profile) => void;
    onCancel?: () => void;
}

export const ProfileForm = ({ initial, title, intro, submitLabel, onSubmit, onCancel }: Props) => {
    const [name, setName] = useState(initial?.name ?? "");
    const [role, setRole] = useState<Role>(initial?.role ?? "voter");

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (name.trim()) onSubmit({ name: name.trim().slice(0, 40), role });
    };

    return (
        <form className="panel profile" onSubmit={submit}>
            <h2>{title}</h2>
            {intro && <p className="muted intro">{intro}</p>}
            <label htmlFor="name">Your name</label>
            <input id="name" value={name} onChange={e => setName(e.target.value)} maxLength={40} required />
            <fieldset>
                <legend>Join as</legend>
                <label className="radio">
                    <input type="radio" checked={role === "voter"} onChange={() => setRole("voter")} />
                    Voter
                </label>
                <label className="radio">
                    <input type="radio" checked={role === "spectator"} onChange={() => setRole("spectator")} />
                    Spectator (watch without voting)
                </label>
            </fieldset>
            <div className="row end">
                {onCancel && (
                    <button type="button" onClick={onCancel}>
                        Cancel
                    </button>
                )}
                <button type="submit" className="primary">
                    {submitLabel}
                </button>
            </div>
        </form>
    );
};
