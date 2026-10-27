# 🃏 Planning Poker

Free, open-source planning poker for remote agile teams. It's a static web app and browsers talk to each other directly over WebRTC: **no backend, no accounts, no database, $0 to host.**

## How a session works

1. **The admin creates the room.** Click *Create a room* and enter your name. You're the room's admin.
2. **Share the participant link.** Use the *Copy participant link* button and paste it in your Teams or Slack chat.
3. **Participants join.** They open the link, type their name, choose voter or spectator, and they're in. Everyone sees who's in the room and who has voted.
4. **The admin runs the session.** Add stories, reveal the cards, start a new vote, save the estimate and move to the next story. Participants pick cards.

The admin also has a private **admin link**, under *Your admin link*. Opening it on another device or browser restores admin rights. The browser the room was created in remembers you automatically. While no admin is in the room, voting carries on but the session controls are locked.

## Features

- **Rooms by link.** The admin creates a room and shares the link. Anyone who has it can join.
- **Admin-run sessions.** Only the admin can reveal, start a new round, change the deck, manage stories, run the timer and save estimates.
- **Secret voting.** Only "has voted" is shared. The card values leave each voter's browser only when the cards are revealed.
- **Four decks:** Fibonacci, modified Fibonacci (½, 20, 40, 100, ∞), T-shirt sizes and powers of 2. Every deck also has `?` and `☕`.
- **Results.** Average, median, most-voted card, vote distribution and a consensus badge. Outliers are highlighted, and the closest card is suggested as the estimate.
- **Story queue.** Paste stories one per line, reorder them, estimate them one after another, and export the estimates as CSV (opens cleanly in Excel).
- **Spectators.** Watch without voting. An admin can also be a spectator, to facilitate without voting.
- **Round timer.** 30 s to 5 min, optionally revealing the cards when time is up.
- **Resilient.**
  - A refresh keeps your seat and your pending vote.
  - If the person "hosting" the state leaves, someone else takes over without losing anything.
  - Peers that can't connect directly are relayed through others.
- Light and dark mode, and works on phones.

## How the networking works, for free

```
  ┌────────────┐   1. find each other (signaling only)  ┌───────────────────┐
  │ Browser A  │ ─────────────────────────────────────▶ │ Public Nostr      │
  │ Browser B  │ ◀───────────────────────────────────── │ relays (WSS :443) │
  └─────┬──────┘                                        └───────────────────┘
        │ 2. direct, encrypted WebRTC data channels (DTLS)
        │    STUN discovers public addresses, TURN relays only if a direct path is impossible
  ┌─────▼──────┐
  │ Browser C  │   App files: static hosting (GitHub Pages)
  └────────────┘
```

| Piece | Provider | Cost |
|---|---|---|
| Hosting the app | GitHub Pages (or Cloudflare Pages / Netlify) | Free |
| Signaling (peer discovery) | Public [Nostr](https://nostr.com) relays via [Trystero](https://github.com/dmotz/trystero) | Free, no signup |
| NAT traversal | Public STUN servers (Trystero defaults) | Free, no signup |
| Relay for strict networks *(optional)* | [Metered Open Relay](https://www.metered.ca/tools/openrelay/) free tier | Free with signup |

**Signaling.** Each room's link contains a random secret in the URL fragment (`#…`), which browsers never send to any server. Trystero uses it to encrypt the connection offers it posts to the relays. The relays only see opaque encrypted blobs, and after the handshake they're out of the loop.

**Room state.**
- Every browser holds a full copy.
- One peer, the *host* (the first to arrive), applies changes and broadcasts them.
- If the host leaves, the next person in join order takes over.
- The last state is also kept in `localStorage`, so a room reopened later still has its story queue.

### When do you need TURN?

STUN alone works for most home and office connections. Some peers can't connect directly, for example behind symmetric NATs, some corporate VPNs, or firewalls that block UDP. If at least one other participant can reach them, the app relays through that participant automatically. If nobody can, set up a TURN relay:

1. Create a free account at [metered.ca](https://www.metered.ca/tools/openrelay/) and create TURN credentials.
2. Put the URLs, username and credential in `VITE_TURN_*` (see [`.env.example`](.env.example)). In GitHub, use repository **variables**, plus a **secret** for the credential.
3. Include a `turns:…:443` URL. TURN over TLS on port 443 gets through almost any firewall.

Planning poker sends a few kilobytes per session, so a free tier is far more than enough. Check the provider's current limits before relying on them, because free tiers change. TURN credentials embedded in a public site can be used by anyone who reads the bundle. That's the trade-off for having no backend. Cloudflare's TURN service works too, but it needs short-lived credentials issued by a small server-side function.

## Deploy your own (GitHub Pages)

1. Push this repository to GitHub (public repos get Pages for free).
2. **Settings → Pages → Source: GitHub Actions.**
3. Optional: **Settings → Secrets and variables → Actions**.
   - Set `VITE_APP_ID` to something unique to your team.
   - Set the TURN variables if you need them.
4. Push to `main`. The workflow lints, tests and builds, then publishes to `https://<owner>.github.io/<repo>/`.

On another static host, build with `BASE_PATH=/ pnpm build` and upload `dist/`. This works for Netlify, Cloudflare Pages, or a custom domain. Routing is hash-based, so no rewrite rules are needed.

## Development

Requires Node 24 (`nvm use`) and pnpm.

```sh
pnpm install
pnpm dev          # http://localhost:5173/planning-poker/: open it in two tabs to try it
pnpm test         # unit tests, including multi-peer sync scenarios on an in-memory network
pnpm check        # Biome lint + format check (pnpm check:fix to apply)
pnpm build        # type-check + production build
```

Each browser tab is its own participant, so testing with several tabs works.

To try it from other devices on your network, run `pnpm dev:lan` and open the `https://<your-ip>:5173/planning-poker/` address it prints. You'll have to accept the browser warning about the self-signed certificate. Plain `http://<your-ip>` won't work: browsers only provide the WebCrypto API, which WebRTC signaling needs, on HTTPS pages and on `localhost`. GitHub Pages is always HTTPS.

### Code map

| Path | What it does |
|---|---|
| `src/domain/` | Pure logic: types, decks, the `roomReducer` state machine, stats, CSV. No I/O. |
| `src/net/transport.ts` | The `Transport` interface: the only thing room logic knows about networking. |
| `src/net/trysteroTransport.ts` | WebRTC implementation (Trystero + Nostr signaling, optional TURN). |
| `src/net/roomSync.ts` | Replication protocol: host election, state broadcast, secret votes, relaying, timer. |
| `src/net/fakeNetwork.ts` | In-memory network for tests, which can simulate broken links between peers. |
| `src/state/` | React hook, identity and storage helpers. |
| `src/ui/` | React components. |

To use a server instead of P2P, for example a small Node WebSocket relay, implement `Transport` (three methods) and pass it to `RoomSync`. Nothing else changes.

## Trust model and limitations

- **The participant link is the key.** Anyone with it can join and vote. Only the admin link (or the creator's browser) can run the session.
- **Admin rights stop accidents, not a determined insider.** The room state stores only a SHA-256 hash of the admin key, and the host verifies the key when an admin joins. Still, in a serverless app one participant's browser (the host) applies the changes. Someone with devtools could forge actions, but nobody can see anyone's vote before reveal. This is built for teams that trust each other.
- **Votes are lost if a voter disconnects before the reveal.** They live only in that voter's browser, which is the point. A refresh is fine: the vote is kept per tab.
- **If a public relay is down or slow**, Trystero uses the others. You can pin your own list with `VITE_NOSTR_RELAYS`.
- **Data channels are full mesh.** That's fine for team-sized rooms (up to about 20 people).

## License

[MIT](LICENSE)
