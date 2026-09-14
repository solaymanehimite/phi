# Remote access (test branch)

Run the Phi sidecar on a VPS, connect to it from Phi on your laptop.
This is the `remote-access` branch. `main` is untouched.

## How it works

- The sidecar already binds `PHI_HOST` and gates every `/api/*` route
  (except `/api/health`) on `PHI_TOKEN` as `Authorization: Bearer <token>`.
- Phi routes all API calls and SSE streams to the active host
  (`src/lib/api.ts` + `HostPicker`), attaching the stored token.
- So "remote access" is deployment, not protocol: put the sidecar on the
  VPS with a token, add it as a host in Phi, select it.

## 1. Build the sidecar

On your dev machine:

```bash
bun run build:sidecar
# produces binaries/server-x86_64-unknown-linux-gnu (standalone, no runtime needed)
```

## 2. Copy it to the VPS

```bash
scp binaries/server-x86_64-unknown-linux-gnu user@vps:/opt/phi/phi-sidecar
ssh user@vps 'chmod +x /opt/phi/phi-sidecar'
```

## 3. Authenticate providers on the VPS

Models and keys live per machine. The VPS sidecar cannot use your
laptop's logins. On the VPS, do one of:

- Log in with the Pi CLI so its credential store exists there, or
- Point `PHI_AUTH_PATH` at a `phi/auth.json` holding your providers
  (same format as `~/.config/phi/auth.json`).

Without this, `/api/models` returns an empty list and prompts fail.

## 4. Run it

```bash
PHI_HOST=0.0.0.0 PORT=3001 PHI_TOKEN="$(openssl rand -hex 32)" \
  /opt/phi/phi-sidecar
```

Expected log:

```text
[phi sidecar] listening on http://0.0.0.0:3001
[phi sidecar] token auth enabled
```

Keep `PHI_TOKEN` somewhere safe. Every Phi client connecting to this
host needs it.

### systemd (survives reboots)

`/etc/systemd/system/phi-sidecar.service`:

```ini
[Unit]
Description=Phi sidecar
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/opt/phi/phi-sidecar
Environment=PHI_HOST=0.0.0.0
Environment=PORT=3001
Environment=PHI_TOKEN=replace-with-your-token
# Optional: Environment=PHI_AUTH_PATH=/opt/phi/auth.json
Restart=on-failure
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now phi-sidecar
```

## 5. Lock down the network

Plain HTTP + token stops casual snooping, nothing more. Pick one:

- Best: Tailscale on both machines, bind `PHI_HOST` to the tailnet IP
  and never expose the port publicly.
- Good: Caddy/Nginx reverse proxy with TLS in front of
  `127.0.0.1:3001`, firewall the raw port (`ufw deny 3001`).
- Minimum: firewall the port to your laptop IP only
  (`ufw allow from <your-ip> to any port 3001`).

## 6. Connect from Phi

1. Open Settings, Hosts tab, Add host.
2. Name: whatever (e.g. "VPS"). URL: `http://vps:3001` (or `https://…`
   behind a proxy). Token: the `PHI_TOKEN` value.
3. New chats pick the host from the run-target picker next to the project
   picker. Opening any session jumps execution to the target it lives on.

## 7. Projects across run targets

A project holds one workspace path per run target. The sidebar aggregates
sessions from every reachable host, grouped by project, each row badged
with its run target. Unreachable hosts degrade to empty lists; the host
picker dots show their status.

- New chat picks a project in the directory picker, then a run target next
  to it. The target lists every host; unbound ones offer inline setup
  (type the absolute path on that host).
- Picking a project keeps the current target when bound, otherwise jumps to
  its first bound target. Opening any session points execution at the
  target it lives on.
- Sending on an unbound (project, target) pair is blocked with a hint.
  Continuing a session always runs on its original target.
- Project settings (rename, per-target paths) live in the directory
  picker's edit view. `git` is the sync between targets; sessions never
  move.

## Troubleshooting

- `unauthorized — check host token`: token in Phi does not match the
  VPS `PHI_TOKEN`. Edit the host, paste again.
- Host shows red: `curl http://vps:3001/api/health` from your laptop.
  If that fails, it is firewall/routing, not Phi.
- Empty model list: providers are not authenticated on the VPS (step 3).
- Streams stall behind a proxy: the sidecar already sends SSE
  heartbeats and `X-Accel-Buffering: no`. Check the proxy is not
  buffering (`proxy_buffering off` for Nginx).
