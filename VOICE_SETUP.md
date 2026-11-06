# Party Voice Chat — setup and troubleshooting

Voice chat is opt-in and uses WebRTC browser-to-browser audio. The Node server relays only signaling, not microphone audio.

## Quick two-device test

1. Open the HTTPS game on two separate phones/computers and join the same *private party* as separate players.
2. Tap **Join Voice Chat** on both, allow microphone access, and use **Test Speaker** on each device.
3. Check each player displays **Connected** (not **Connecting…** or **Connection failed**).
4. Tap **Enable Sound** once on each phone if the peer is connected but silent.
5. Use headphones or separate the devices to avoid feedback and echo.

The speaking indicator shows local microphone input; **it does not prove** another device has received or played that audio.

## TURN relay (recommended for reliable calls across different networks)

Without a TURN server, STUN-only WebRTC connections can fail across carrier-grade NAT, symmetric NAT, cellular networks, and restrictive Wi-Fi. A Render web service is **not itself a TURN relay**.

Provision a trusted TURN service and set these **Render web service environment variables**:

- `VOICE_TURN_URLS` — comma-separated TURN endpoints provided by the service, e.g. `turn:your-relay.example:3478,turns:your-relay.example:5349`
- `VOICE_TURN_USERNAME` — provider-issued TURN username
- `VOICE_TURN_CREDENTIAL` — provider-issued TURN credential

Do **not** commit TURN secrets into GitHub. Prefer time-limited credentials from your TURN provider rather than long-lived shared credentials: browsers necessarily receive the temporary relay login in order to connect.

Redeploy/restart the Render service after changing environment variables; both users should leave and rejoin voice.

If the **Test Speaker** button works but peers show **Connection failed**, investigate TURN/network signaling rather than speaker volume. If peers show **Connected** but remain silent, press **Enable Sound**, check phone volume and browser audio routing, and verify the other participant is unmuted.

Voice chat has not been fully end-to-end tested on two physical devices yet. The solo computer opponent does not provide voice audio.
