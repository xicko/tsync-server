<div align="center">

# tsync-server ✧*:

**powering the tsync ecosystem with real-time device synchronization and remote orchestration.**

[![NestJS](https://img.shields.io/badge/NestJS-11.0-E0234E?logo=nestjs&logoColor=white&style=flat-square)](https://nestjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Persistance-47A248?logo=mongodb&logoColor=white&style=flat-square)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-Caching-DC382D?logo=redis&logoColor=white&style=flat-square)](https://redis.io/)
[![Tailscale](https://img.shields.io/badge/Tailscale-Networking-4B23D1?logo=tailscale&logoColor=white&style=flat-square)](https://tailscale.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)

</div>

---

## features

- **centralized orchestration**: manage device statuses and configurations in one place.
- **real-time events**: websocket-driven updates for instant device-to-client communication.
- **android remote control**: integrated adb bridge for sending commands and screen interaction.
- **smart task scheduling**: dynamic cron jobs for health checks, reminders, and data sync.
- **multi-channel alerts**: notification dispatching via onesignal, ntfy, and telegram.
- **data persistence**: robust mongodb storage for system logs, device history, and user data.

---

## requirements

- **environment**: node.js v18+ and pnpm/npm.
- **infrastructure**:
  - [mongodb](https://www.mongodb.com/) instance (local or atlas).
  - [redis](https://redis.io/) server for pub/sub and caching.
  - [adb](https://developer.android.com/studio/releases/platform-tools) setup for remote control features.
- **integrations**:
  - [tailscale](https://tailscale.com) api keys & tailnet id.
  - [onesignal](https://onesignal.com/) rest api keys.
  - [telegram](https://my.telegram.org/) api id/hash for bot/client features.

---

## environment setup

create a `.env` file in the root based on `.env.example`:

| category | variables |
| :--- | :--- |
| **tailscale** | `TAILNET_ID`, `TAILNET_API_KEY` |
| **database** | `MONGO_URI`, `DB_NAME`, `REDIS_URL` |
| **notifications** | `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_KEY`, `NTFY_TOPIC` |
| **adb/remote** | `ADB_ADDRESS`, `ADB_ADDRESS2`, `HOST_IP`, `WOL_SERVICE_PORT` |
| **telegram** | `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` |

---

## project startup

1. **install dependencies**
   ```bash
   pnpm install
   # or
   npm install
   ```

2. **generate telegram session** (optional)
   ```bash
   npm run telegram:session
   ```

3. **launch development server**
   ```bash
   npm run start:dev
   ```

4. **production build**
   ```bash
   npm run build
   npm run start:prod
   ```

---

> [!NOTE]
> this backend is designed specifically for the tsync client ecosystem. ensure your tailscale nodes are correctly configured for adb access.
