/**
 * Random identifiers from `crypto.getRandomValues`, which (unlike `crypto.randomUUID`) also exists
 * on non-HTTPS pages, so a wrong URL gets a helpful message instead of a crash.
 */
export const randomToken = (bytes: number) => {
    const data = crypto.getRandomValues(new Uint8Array(bytes));
    return btoa(String.fromCharCode(...data))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
};

export const randomId = () => randomToken(16);
