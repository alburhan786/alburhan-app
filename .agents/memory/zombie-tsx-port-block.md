---
name: Zombie tsx processes block port 8080
description: Multiple stale api-server tsx processes survive WorkflowsRestart; oldest owns port 8080 so every new process exits silently; symptom is new code/env not taking effect despite apparent restart success.
---

## The problem

`WorkflowsRestart` sends SIGTERM to the **managed** process but tsx spawns a parent CLI wrapper + a child Node.js worker. If the child doesn't exit cleanly (e.g. blocked on a pending async op), the parent eventually exits but the child lingers and keeps port 8080 open.

Each subsequent `WorkflowsRestart` spawns another pair; the new child can't bind port 8080 and exits silently. Requests continue hitting the original zombie process running stale code with stale env vars.

**Why:**
- tsx's child process traps SIGTERM (or ignores it) when there are active async operations (DB queries, cron jobs, open keep-alive connections).
- Port 8080 is bound in the child process, not the parent CLI wrapper.
- The Replit workflow system considers the restart "done" when the managed PID exits — it doesn't verify that port 8080 is free.

## Symptoms

- `WorkflowsRestart` succeeds but code changes / new secrets don't take effect
- New routes return 404 while old routes still work
- Health endpoint returns an old PID
- `pgrep -a node | grep index.ts` shows multiple processes
- `lsof -i :8080 -sTCP:LISTEN` shows the oldest PID still owns the port

## Diagnosis

```bash
lsof -i :8080 -sTCP:LISTEN        # which PID owns the port?
pgrep -a node | grep index.ts     # how many processes?
```

## Fix

```bash
# Kill ALL api-server node processes
pkill -f "artifacts/api-server"
sleep 2
# Confirm port is free
lsof -i :8080 -sTCP:LISTEN || echo "port free"
# Then use WorkflowsRestart (or let Replit auto-restart the managed workflow)
```

**How to apply:** Do this any time a restart doesn't seem to take effect — new env vars, new routes, or code changes not appearing despite a successful `WorkflowsRestart`.
