#!/bin/bash
set -e
# Write .env using base64 (no special char issues)
echo "Tk9ERV9FTlY9cHJvZHVjdGlvbgpQT1JUPTUwMDAKREFUQUJBU0VfVVJMPXBvc3RncmVzcWw6Ly9hbGJ1cmhhbjpBbEJ1cmhhbjIwMjZTZWN1cmVAbG9jYWxob3N0OjU0MzIvYWxidXJoYW5kYgpTVEFUSUNfRklMRVNfRElSPS92YXIvd3d3L2FsYnVyaGFuL2FydGlmYWN0cy9hbGJ1cmhhbi9kaXN0L3B1YmxpYwpVUExPQURTX0RJUj0vdmFyL3d3dy9hbGJ1cmhhbi91cGxvYWRzCkNPUlNfT1JJR0lOPWh0dHBzOi8vYWxidXJoYW50cmF2ZWxzLmNvbSxodHRwczovL3d3dy5hbGJ1cmhhbnRyYXZlbHMuY29tCkZBU1QyU01TX0FQSV9LRVk9J1hYU0w1bUkzd085cGlPRzYyVmExbEp5dmQ0SkNFQ01YaHpYbTdkRDdZMkpLeWR5bm1hNklBRHB1MXZjYicKUkFaT1JQQVlfS0VZX0lEPSdyenBfbGl2ZV9TT01YOXJtZ1hacm9URCcKUkFaT1JQQVlfU0VDUkVUPSdSTjdkWDJkODZtZFJyRzVxTnoyZFk1QkcnCkJPVEJFRV9BUElfS0VZPScxODU4Nnx3Tk5GMDR1RGRSNmZGSFp3QlBwY1BRY01EUUoxeXFhdUxOYXhXa0hQNmVhZWQyYmEnCkJPVEJFRV9CVVNJTkVTU19JRD0nMjMyMjM1MzE2NDkzMzk1OCcKQk9UQkVFX1BIT05FX05VTUJFUl9JRD0nKzkxODk4OTcwMTcwMScKU0VTU0lPTl9TRUNSRVQ9J1kyOVpTZlI2aENxb0NYbUd4b0xIMWdjWXlnLzFYN0taVjd3OXM0R29LOWxWaUJ3Skt4MExaWFQ4QnJmL0gwcnhva1hNN3dpcGlMM09FUTgyakhhWTd3PT0nCg==" | base64 -d > /var/www/alburhan/.env
echo "✓ .env written ($(wc -l < /var/www/alburhan/.env) lines)"

cd /var/www/alburhan

# Write ecosystem.config.cjs with env vars embedded directly
python3 -c "
import base64
env_raw = base64.b64decode(\"Tk9ERV9FTlY9cHJvZHVjdGlvbgpQT1JUPTUwMDAKREFUQUJBU0VfVVJMPXBvc3RncmVzcWw6Ly9hbGJ1cmhhbjpBbEJ1cmhhbjIwMjZTZWN1cmVAbG9jYWxob3N0OjU0MzIvYWxidXJoYW5kYgpTVEFUSUNfRklMRVNfRElSPS92YXIvd3d3L2FsYnVyaGFuL2FydGlmYWN0cy9hbGJ1cmhhbi9kaXN0L3B1YmxpYwpVUExPQURTX0RJUj0vdmFyL3d3dy9hbGJ1cmhhbi91cGxvYWRzCkNPUlNfT1JJR0lOPWh0dHBzOi8vYWxidXJoYW50cmF2ZWxzLmNvbSxodHRwczovL3d3dy5hbGJ1cmhhbnRyYXZlbHMuY29tCkZBU1QyU01TX0FQSV9LRVk9J1hYU0w1bUkzd085cGlPRzYyVmExbEp5dmQ0SkNFQ01YaHpYbTdkRDdZMkpLeWR5bm1hNklBRHB1MXZjYicKUkFaT1JQQVlfS0VZX0lEPSdyenBfbGl2ZV9TT01YOXJtZ1hacm9URCcKUkFaT1JQQVlfU0VDUkVUPSdSTjdkWDJkODZtZFJyRzVxTnoyZFk1QkcnCkJPVEJFRV9BUElfS0VZPScxODU4Nnx3Tk5GMDR1RGRSNmZGSFp3QlBwY1BRY01EUUoxeXFhdUxOYXhXa0hQNmVhZWQyYmEnCkJPVEJFRV9CVVNJTkVTU19JRD0nMjMyMjM1MzE2NDkzMzk1OCcKQk9UQkVFX1BIT05FX05VTUJFUl9JRD0nKzkxODk4OTcwMTcwMScKU0VTU0lPTl9TRUNSRVQ9J1kyOVpTZlI2aENxb0NYbUd4b0xIMWdjWXlnLzFYN0taVjd3OXM0R29LOWxWaUJ3Skt4MExaWFQ4QnJmL0gwcnhva1hNN3dpcGlMM09FUTgyakhhWTd3PT0nCg==\").decode()
env_dict = {}
for line in env_raw.split(\'\\n\'):
    line = line.strip()
    if \'=\' in line and not line.startswith(\'#\'):
        k, v = line.split(\'=\', 1)
        env_dict[k.strip()] = v.strip().strip(\"'\")

lines = [\'module.exports = {\', \'  apps: [{\', \'    name: \"api-server\",\', \'    script: \"artifacts/api-server/dist/index.cjs\",\', \'    cwd: \"/var/www/alburhan\",\', \'    env: {\']
for k,v in env_dict.items():
    lines.append(f\'      SESSION_SECRET: 'Y29ZSfR6hCqoCXmGxoLH1gcYyg/1X7KZV7w9s4GoK9lViBwJKx0LZXT8Brf/H0rxokXM7wipiL3OEQ82jHaY7w==',\')
lines += [\'    }\', \'  }]\', \'};\']
with open(\'/var/www/alburhan/ecosystem.config.cjs\', \'w\') as f:
    f.write(\'\\n\'.join(lines))
print(\'✓ ecosystem.config.cjs written with\', len(env_dict), \'env vars\')
"

pm2 delete api-server 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
sleep 3

echo "--- Testing auth route ---"
curl -s -X POST http://localhost:5000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"0000000000"}' || echo "curl failed"
