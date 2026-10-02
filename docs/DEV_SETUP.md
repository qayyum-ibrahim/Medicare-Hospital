# Dev setup (Phase 0)

Goal of this phase: confirm your machine can run the project, and that you have a MongoDB that supports **transactions**. No app code yet. After each step, tell me it worked or paste the error.

What I have and have not tested: the check tool's error paths (no argument, unreachable server) were run in my sandbox. Its success path against a real replica set, the Docker setup and the Atlas steps could **not** be run there. If any of them misbehaves for you, that is useful information, not your mistake.

---

## Step 1: Pre-flight (2 minutes)

Open a terminal (PowerShell or Command Prompt on Windows, Terminal on macOS/Linux) and run:

```
node -v
npm -v
git --version
docker --version
```

`docker` is optional. Send me:
1. The output of those four commands (an error for `docker` is fine, just say so).
2. Your operating system (Windows, macOS or Linux).
3. Roughly how much RAM the machine has.
4. Which MongoDB option below you will use (I recommend A if the machine is older or has 8 GB of RAM or less).

Requirement: **Node 22 or newer** (Mongoose 9 needs at least 20.19). If `node -v` shows something older, install a current version from nodejs.org and run the commands again.

Also required: **npm 11.21.0**. npm 11.1.0 crashes when installing Vitest (`Cannot read properties of null (reading 'edgesOut')`). Upgrade with `npm install -g npm@11.21.0` (add `sudo` if you get a permission error), then check with `npm -v`. Do not install npm 12.x: it declares support only for Node 22.22.2 or newer.

---

## Step 2: Create the project folder

```
mkdir meridian-care
cd meridian-care
```

Put the files I gave you in this layout:

```
meridian-care/
  README.md
  .gitignore
  docs/
    PHASE0_PLAN.md
    ASSUMPTIONS.md
    DEV_SETUP.md
  tools/
    check-mongo/
      check.mjs
      package.json
      package-lock.json
```

Then start version control:

```
git init
git add .
git commit -m "Phase 0: plan, assumptions, dev setup"
```

Read `docs/PHASE0_PLAN.md` and `docs/ASSUMPTIONS.md`. Anything you disagree with, tell me now, because it is cheapest to change before code exists.

---

## Step 3: Get a MongoDB (pick one)

The project uses multi-document transactions (for example, dispensing a drug must reduce stock and create a bill line together, or not at all). MongoDB only supports these when it runs as a **replica set**, even a single-node one.

### Option A: MongoDB Atlas free cluster (no Docker, lightest on your machine)

The screens may have changed since my knowledge was last updated. If a step does not match what you see, tell me what you see.

1. Create an account at mongodb.com/atlas and create a free cluster.
2. Create a database user (username and password). Prefer a password without special characters. If it has any, they must be URL-encoded in the connection string.
3. Under Network Access, add your current IP address. If your IP changes (common on mobile data), you will need to add the new one.
4. Choose Connect, then Drivers, and copy the connection string. It looks like `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/`. Replace `<password>` with your real password.

I believe Atlas clusters run as replica sets, which is what we need. The check tool in Step 4 confirms it rather than trusting my belief.

### Option B: Docker (fully local)

Requires Docker Desktop (Windows/macOS) or Docker Engine (Linux). Docker Desktop is heavy on older machines.

Create a file called `docker-compose.yml` in the project root:

```yaml
services:
  mongo:
    image: mongo:8
    container_name: meridian-mongo
    command: ["--replSet", "rs0", "--bind_ip_all", "--port", "27017"]
    ports:
      - "27017:27017"
    volumes:
      - meridian-mongo-data:/data/db
    healthcheck:
      test: >
        mongosh --port 27017 --quiet --eval
        "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}).ok }"
      interval: 5s
      timeout: 10s
      retries: 20
      start_period: 5s

volumes:
  meridian-mongo-data:
```

Start it and wait about 20 seconds:

```
docker compose up -d
docker compose ps
```

The status should become `healthy`. Your connection string is:

```
mongodb://localhost:27017/?replicaSet=rs0&directConnection=true
```

I have not confirmed the `mongo:8` image tag on Docker Hub. If `docker compose up` says the image is not found, tell me and I will give you a tag that exists.

### Option C: MongoDB installed directly on your machine

Not recommended, because a normal install starts as a standalone server and has to be converted to a replica set by hand. If A and B are both impossible for you, tell me your operating system and I will write those steps.

---

## Step 4: Run the check tool

From the project root:

```
cd tools/check-mongo
npm install
node check.mjs "PASTE_YOUR_CONNECTION_STRING_HERE"
```

Keep the quotes around the connection string (the `?` and `&` characters break some terminals otherwise).

A healthy result looks like this (the version numbers will differ):

```
PASS  Node version is 20.19 or newer (22+ recommended)  (found v22.x.x)
PASS  Connected to MongoDB  (server 8.x.x)
PASS  Running as a replica set (needed for transactions)  (set "rs0")
PASS  Transaction commits  (1 document found)
PASS  Transaction rolls back  (0 leftover documents)

All checks passed. Paste this whole output back to me.
```

The tool writes only to a throwaway database called `meridian_check` and deletes its own test collection afterwards.

**Do not paste your real connection string or password to me or anywhere public.** Paste only the output of the tool, which does not print it.

---

## Step 5: Tell me the result

Reply with:
- the Step 1 outputs
- the full output of the check tool
- any objection to the plan or assumptions

When all five checks pass and you have said "continue", I start Phase 1 (project scaffold, login and roles, audit log, patient registration, duplicate detection, queue).

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `node` is not recognised | Node not installed, or terminal opened before install | Install Node 22+, close and reopen the terminal |
| `Connected to MongoDB` fails with a timeout (Atlas) | Your IP is not in the Network Access list | Add your current IP, wait a minute, retry |
| Authentication failed | Wrong password, or special characters not URL-encoded | Reset the database user's password to letters and numbers only |
| `Running as a replica set` fails | Standalone MongoDB | Use Option A or B |
| Docker container stays `starting` | Replica set still initialising | Wait 30 seconds and run `docker compose ps` again |
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB is not running | `docker compose up -d`, then retry |
| `npm install` fails on a school or office network | Registry blocked or slow | Tell me the error text |

---

## Security notes

- Never commit connection strings or passwords. `.env` files are already in `.gitignore`.
- Use a database user made for this project only.
- This project uses fictional data only. Do not load any real patient information into it.
