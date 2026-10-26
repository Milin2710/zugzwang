# Deploying Zugzwang on one AWS EC2 server

Everything runs on a single small VM with Docker Compose: the web app, the game server, Redis and Caddy (HTTPS).
MongoDB lives in Atlas (free). Replace the example domain names with yours.

```
Browser ──https──> Caddy ──> client  (Next.js, :3000)   zugzwang-app.duckdns.org
Browser ──wss────> Caddy ──> server  (Node,    :4000)   zugzwang-api.duckdns.org ──> Redis (same VM, private)
                                                                          └──────> MongoDB Atlas
```

## 0. Before anything: upgrade Next.js (security fix)

Next.js 15.4.6 has a critical vulnerability (React2Shell). Patched releases of the 15.4 line start at 15.4.8; use the latest 15.5.x.
This matters for self-hosting too.

```powershell
cd client
npm install next@^15.5.7
npm install -D eslint-config-next@^15.5.7
npm run build
npm audit
cd ..
git add -A; git commit -m "Upgrade Next.js (security fix)"; git push
```

## 1. MongoDB Atlas (free)

1. Create a free **M0** cluster (pick a region near your server).
2. **Database Access:** add a user with a password (read and write to any database).
3. **Network Access:** add your server's Elastic IP (step 2) once you have it. Using `0.0.0.0/0` works but is weaker.
4. **Connect, Drivers:** copy the connection string and add the database name: `.../chessing?retryWrites=true&w=majority`.

## 2. EC2 server

1. EC2, **Launch instance**: Ubuntu Server 24.04 LTS, a 2 GB instance (for example `t4g.small` or `t3.small`; use one the free plan allows), 20 GB gp3 disk, create and download a key pair.
2. **Security group inbound rules:** SSH (22) from *My IP* only; HTTP (80) and HTTPS (443) from anywhere. Do not open 4000, 3000 or 6379.
3. **Elastic IP:** allocate one and associate it with the instance, so the address survives reboots.
4. **Billing:** create an AWS Budget alert so you hear about credit usage early.

## 3. Domain names (free)

At duckdns.org create two names (for example `zugzwang-app` and `zugzwang-api`) and point both at the Elastic IP.

Clerk note: production Clerk instances need a domain you own, so a DuckDNS name is a problem for them. Start with your Clerk **development** keys (they work on other domains but show a development notice). If you buy a cheap domain later, switch to production keys and set `APP_DOMAIN` and `API_DOMAIN` accordingly.

## 4. Prepare the server

```bash
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit        # log in again after this

# 2 GB swap, so the Next.js build can't run out of memory
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

git clone https://github.com/Milin2710/zugzwang.git && cd zugzwang
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
nano deploy/.env        # domains, MongoDB URI, Clerk keys
```

## 5. Start everything

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.prod.yml ps
```

The first build takes several minutes. Containers restart automatically after a crash or reboot.

## 6. Check it works

1. `https://zugzwang-api.duckdns.org/health` should answer OK.
2. Open `https://zugzwang-app.duckdns.org`, sign up, and press **Play a rated game**.
3. Sign in as a second user in a private window and play a few moves.
4. Logs: `docker compose -f deploy/docker-compose.prod.yml logs -f server`

## 7. Keep it healthy

- **Monitoring:** add an UptimeRobot (or similar) HTTP check for `https://API_DOMAIN/health`. This now works, because the VM never sleeps.
- **Update the app:** `git pull`, then run the same `up -d --build` command.
- **Backups:** MongoDB Atlas holds all permanent data. Redis only holds games in progress (kept across restarts by the append-only file).
- **Disk:** `docker system prune -f` now and then removes old images.

## 8. When the free plan ends (about 6 months)

Either upgrade the AWS account and keep the same server, or move to any other VPS: install Docker, clone the repo, copy `deploy/.env`, run the same command, and point the DuckDNS names at the new IP. Your data is in Atlas, so nothing else moves.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser says mixed content or the socket won't connect | `NEXT_PUBLIC_BACKEND_URL` must be the `https` API domain. It is baked in at build time, so rebuild after changing it. |
| 401 everywhere | Clerk keys missing or from different instances; or `CORS_ORIGINS` doesn't match the app domain. |
| Certificates fail | The DuckDNS names don't point at the Elastic IP yet, or ports 80/443 are closed in the security group. |
| Server can't reach MongoDB | The Elastic IP isn't in Atlas Network Access, or the password in the URI needs URL-encoding. |
| Build killed | Out of memory: check the swap file is on (`swapon --show`). |
