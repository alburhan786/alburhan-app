#!/bin/bash
echo "=== API Server Status ==="
pm2 status api-server

echo ""
echo "=== Testing API routes ==="
curl -s http://localhost:5000/api/packages | head -c 200
echo ""
curl -s http://localhost:5000/api/packages/categories | head -c 200

echo ""
echo "=== Database check ==="
PGPASSWORD=AlBurhan2026Secure psql -U alburhan -d alburhandb -h localhost -c "SELECT COUNT(*) as packages FROM packages; SELECT COUNT(*) as bookings FROM bookings; SELECT COUNT(*) as users FROM users;" 2>&1

echo ""
echo "=== ENV check in PM2 ==="
pm2 env 0 | grep -E "NODE_ENV|PORT|FAST2SMS|DATABASE_URL" | head -10
