import { randomId } from "../domain/ids";
import type { Role } from "../domain/types";
import { storage } from "./storage";

export interface Profile {
    name: string;
    role: Role;
}

/**
 * Participant id, kept in sessionStorage: it survives a refresh (so you get your seat back)
 * but each tab is its own participant, which also makes local testing with several tabs work.
 */
export const getParticipantId = (): string => {
    const existing = storage.read<string>(storage.session, "pp:pid");
    if (existing) return existing;
    const id = randomId();
    storage.write(storage.session, "pp:pid", id);
    return id;
};

/** Name and role are remembered across rooms and sessions on this device. */
export const loadProfile = (): Profile | null => {
    const profile = storage.read<Profile>(storage.local, "pp:profile");
    return profile?.name ? profile : null;
};

export const saveProfile = (profile: Profile) => storage.write(storage.local, "pp:profile", profile);
