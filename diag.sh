#!/bin/bash
echo "=== Nginx Config ==="
cat /etc/nginx/sites-enabled/alburhantravels.com 2>/dev/null || cat /etc/nginx/sites-enabled/default 2>/dev/null || ls /etc/nginx/sites-enabled/

echo ""
echo "=== Testing API from outside (as browser sees it) ==="
curl -s "https://alburhantravels.com/api/packages" | head -c 300
echo ""

echo ""
echo "=== Testing login from outside ==="
curl -s -X POST "https://alburhantravels.com/api/auth/send-otp"   -H "Content-Type: application/json"   -d '{"mobile":"9893989786"}' | head -c 200
