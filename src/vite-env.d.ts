/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Namespace for peer discovery. Change it for a private deployment so rooms never mix with others. */
    readonly VITE_APP_ID?: string;
    /** Comma-separated Nostr relay URLs, overriding Trystero's defaults. */
    readonly VITE_NOSTR_RELAYS?: string;
    /** Comma-separated TURN URLs, e.g. "turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443". */
    readonly VITE_TURN_URLS?: string;
    readonly VITE_TURN_USERNAME?: string;
    readonly VITE_TURN_CREDENTIAL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
