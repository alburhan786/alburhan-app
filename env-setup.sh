#!/bin/bash
set -e
echo "Tk9ERV9FTlY9cHJvZHVjdGlvbgpQT1JUPTUwMDAKREFUQUJBU0VfVVJMPXBvc3RncmVzcWw6Ly9hbGJ1cmhhbjpBbEJ1cmhhbjIwMjZTZWN1cmVAbG9jYWxob3N0OjU0MzIvYWxidXJoYW5kYgpTVEFUSUNfRklMRVNfRElSPS92YXIvd3d3L2FsYnVyaGFuL2FydGlmYWN0cy9hbGJ1cmhhbi9kaXN0L3B1YmxpYwpVUExPQURTX0RJUj0vdmFyL3d3dy9hbGJ1cmhhbi91cGxvYWRzCkNPUlNfT1JJR0lOPWh0dHBzOi8vYWxidXJoYW50cmF2ZWxzLmNvbSxodHRwczovL3d3dy5hbGJ1cmhhbnRyYXZlbHMuY29tCkZBU1QyU01TX0FQSV9LRVk9WFhTTDVtSTN3TzlwaU9HNjJWYTFsSnl2ZDRKQ0VDTVhoelhtN2REN1kySkt5ZHlubWE2SUFEcHUxdmNiClJBWk9SUEFZX0tFWV9JRD1yenBfbGl2ZV9TT01YOXJtZ1hacm9URApSQVpPUlBBWV9TRUNSRVQ9Uk43ZFgyZDg2bWRSckc1cU56MmRZNUJHCkJPVEJFRV9BUElfS0VZPTE4NTg2fHdOTkYwNHVEZFI2ZkZIWndCUHBjUFFjTURRSjF5cWF1TE5heFdrSFA2ZWFlZDJiYQpCT1RCRUVfQlVTSU5FU1NfSUQ9MjMyMjM1MzE2NDkzMzk1OApCT1RCRUVfUEhPTkVfTlVNQkVSX0lEPSs5MTg5ODk3MDE3MDEgClNFU1NJT05fU0VDUkVUPVkyOVpTZlI2aENxb0NYbUd4b0xIMWdjWXlnLzFYN0taVjd3OXM0R29LOWxWaUJ3Skt4MExaWFQ4QnJmL0gwcnhva1hNN3dpcGlMM09FUTgyakhhWTd3PT0K" | base64 -d > /var/www/alburhan/.env
echo ".env written with $(wc -l < /var/www/alburhan/.env) lines"
echo "Keys:"
grep -v "^#" /var/www/alburhan/.env | cut -d= -f1

cd /var/www/alburhan
set -a && source .env && set +a
pm2 delete api-server 2>/dev/null || true
pm2 start artifacts/api-server/dist/index.cjs --name api-server
pm2 save
sleep 3
echo "--- Testing OTP endpoint ---"
curl -s -X POST http://localhost:5000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"test"}'
