import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves the app from /<repo>/. Override with BASE_PATH for other hosts (e.g. "/" on Netlify).
export default defineConfig({
    base: process.env.BASE_PATH ?? "/planning-poker/",
    // `pnpm dev:lan`: self-signed HTTPS, since browsers only allow WebCrypto (needed for WebRTC signaling)
    // on secure pages, and plain http://<your-ip> isn't one.
    plugins: [react(), ...(process.env.LAN_HTTPS ? [basicSsl()] : [])],
});
