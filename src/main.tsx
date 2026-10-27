import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

// No StrictMode: its double-mounted effects would join and leave the P2P room twice on load.
createRoot(root).render(<App />);
