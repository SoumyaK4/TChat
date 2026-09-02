# TChat

TChat is a small, password-protected web chat for a stream. Viewers use the
GitHub Pages site, messages travel through a Cloudflare Worker over WebSockets,
and an OBS browser source can both display the messages and relay them to
Twitch through Firebot.

## How it fits together

```text
Browser chat ──WebSocket──> Cloudflare Worker/Durable Object
                              │
                              └──> OBS browser source
                                      │
                                      └──> Firebot local API ──> Twitch chat
```

## Everyday use

1. Start Firebot and make sure its streamer or bot Twitch account is connected.
2. Start OBS. The TChat browser source must be active for web-chat messages to
   be relayed to Twitch.
3. Open the public chat page and give its URL and chat password to the people
   who should use it:

   ```text
   https://soumyak4.github.io/TChat/
   ```

4. A visitor enters the shared password, chooses a display name, and chats.
   The browser remembers both values in `localStorage`.

Only one active OBS browser source should perform the relay. Two copies of the
source will send every message to Twitch twice.

## Firebot setup

TChat calls Firebot's local API on port `7472` and runs a preset effect list.
The preset receives the formatted text in an argument named `arg1`.

1. In Firebot, create a **Preset Effect List**.
2. Add one argument named exactly `arg1`.
3. Add a **Chat** effect to that list.
4. Set its message to `$#arg1`, and select the Twitch account that should send
   it.
5. With Firebot running, open the following address on the streaming computer:

   ```text
   http://localhost:7472/api/v1/effects/preset
   ```

6. Find the entry with your preset's name and copy its `id` into the OBS URL as
   `firebotPresetId`.

The current source has an old preset ID as a fallback, but putting the ID in the
URL is clearer and survives recreating the source on another machine.

## OBS browser source

Add a Browser source in OBS with this URL, replacing all placeholders:

```text
https://soumyak4.github.io/TChat/obs.html?pw=CHAT_PASSWORD&firebotPresetId=PRESET_ID
```

Recommended OBS settings:

- Width: `800`
- Height: whatever fits the scene, commonly `600`
- Shut down source when not visible: optional; enabling it prevents relays while
  the source is hidden
- Refresh browser when scene becomes active: optional

URL parameters:

| Parameter | Required | Meaning |
| --- | --- | --- |
| `pw` | Yes | Shared TChat password used to connect to the Worker |
| `firebotPresetId` | Recommended | Firebot preset effect list ID |
| `relayonly=true` | No | Relay messages to Firebot without drawing them |
| `debug=true` | No | Show a button that sends a manual Firebot test |
| `test=true` | No | Show sample overlay messages without connecting to TChat |

If the password contains spaces, `&`, `#`, `?`, or other URL punctuation, URL
encode it before putting it in the browser-source URL.

### Quick tests

Test only the overlay layout:

```text
https://soumyak4.github.io/TChat/obs.html?test=true
```

Test the TChat connection and expose the Firebot test button:

```text
https://soumyak4.github.io/TChat/obs.html?pw=CHAT_PASSWORD&firebotPresetId=PRESET_ID&debug=true
```

If the relay fails, check that Firebot is running, verify the preset ID at the
local API URL above, and inspect the OBS browser-source console/log for a
`[Firebot Relay]` error.

## Deployment

Pushing `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
and deploys `frontend/` to GitHub Pages. During deployment, the workflow
replaces `{{WORKER_URL}}` in both JavaScript files with the repository Actions
secret named `WORKER_URL`.

For a fresh GitHub setup:

1. In **Settings → Pages**, select **GitHub Actions** as the source.
2. In **Settings → Secrets and variables → Actions**, create `WORKER_URL`.
3. Set it to the deployed Worker base URL. This repository's current deployment
   uses:

   ```text
   https://chat-backend.soumyak4.workers.dev
   ```

4. Run **Deploy Frontend** or push to `main`.

Do not put the shared chat password in the frontend or in `WORKER_URL`. The
password must be configured as `CHAT_PASSWORD` on the Worker deployment.

## Local frontend preview

There is no build step or package installation. Serve the files with any static
server:

```bash
python3 -m http.server 8080 --directory frontend
```

Then open <http://localhost:8080/obs.html?test=true>. A full local chat
connection will not work until `{{WORKER_URL}}` is replaced with a real Worker
URL; do not commit that temporary replacement.

## Firebot 5.66.7 compatibility

Reviewed against Firebot **v5.66.7** on 2026-09-03. No code change is required:

- The [v5.66.7 release notes](https://github.com/crowbartools/Firebot/releases/tag/v5.66.7)
  describe performance work and an Electron rollback, with no local API breaking
  change.
- Firebot's [effects API documentation](https://docs.firebot.app/v5/dev/api/effects)
  still exposes `GET /api/v1/effects/preset/:presetListId/run`.
- The exact v5.66.7
  [controller implementation](https://github.com/crowbartools/Firebot/blob/v5.66.7/src/server/api/v1/controllers/effects-api-controller.ts)
  maps GET query parameters to preset arguments, so TChat's `?arg1=...` call is
  valid.
- The exact v5.66.7
  [HTTP server implementation](https://github.com/crowbartools/Firebot/blob/v5.66.7/src/server/http-server-manager.ts)
  still enables CORS for API calls from the OBS browser source.

## Security notes

- The chat password is shared, not a per-user account. Anyone with it can join.
- The normal chat page stores the password in browser `localStorage`.
- The OBS URL contains the password, so avoid screenshots or exported scene
  collections that expose the full URL.
- Firebot's port `7472` should remain local to the streaming computer and must
  not be forwarded to the public internet.

## Repository layout

```text
frontend/index.html   Viewer chat page
frontend/app.js       Login, WebSocket, and chat behavior
frontend/obs.html     OBS overlay page
frontend/obs.js       Overlay behavior and Firebot relay
frontend/style.css    Chat and overlay styles
.github/workflows/    GitHub Pages deployment
```
