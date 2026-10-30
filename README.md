# Not on the List — multiplayer alpha 0.3

**Family-first private multiplayer prototype:** 2–8 players; 20 illustrated costume characters; four rooms; secret identities; synchronized rolls, moves, eliminations, spectator TV view.

## Run locally

Requires Node.js 20+.

```
npm install
npm start
```

Open `http://localhost:3000` on your computer. Other family devices on the same Wi-Fi can use `http://YOUR_COMPUTER_LAN_IP:3000` (firewall permitting). For players in different houses, deploy to a Node host that supports **persistent WebSockets** (such as Render, Railway, or Fly.io), with `npm start` as its start command. HTTPS provides WSS for remote access.

**Do not deploy this ZIP to Netlify Drop** — Netlify static hosting cannot run the included persistent multiplayer server. A static upload will display the UI but cannot create or join games.

## How to test

1. Host creates a party and shares a six-character code.
2. 1–7 more players join from other devices. Host starts once at least two players have joined.
3. Players privately reveal their costume, take turns rolling and acting. Other phones and the TV update together.
4. On a TV browser, open the app, enter the party code under **TV Party Mode**, then use the full-screen browser display.
5. Refresh a player's browser to reconnect using its saved session token.

## Notes / limitations

- **Alpha only**: sessions and games are in RAM, so a server restart ends them. Automatic 24-hour cleanup. No database, persistence, moderation, or public matchmaking yet.
- The host cannot kick or remove players. If the host disconnects, the started game continues after they reconnect; an unstarted game cannot proceed without the host.
- The room code is private-by-sharing, not a cryptographic security guarantee. Treat this as a family test, not a hardened public service. Players' secret identities remain server-only and are sent only to that player's socket. TV receives no secret role information. Session tokens are stored locally on each player's browser to reconnect.
- Dice distribution, door connections and exact edge-case elimination rules are **provisional**, as in v0.2, and should be checked against the printed board game before publishing.
- This is an independent prototype and not a licensed recreation of Costume Party Assassins/Detectives. Commercial rights, name and game-design similarity need review before launch.
