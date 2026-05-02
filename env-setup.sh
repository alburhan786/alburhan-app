#!/usr/bin/env python3
import subprocess, os
content = 'NODE_ENV=production\nPORT=5000\nDATABASE_URL=postgresql://alburhan:AlBurhan2026Secure@localhost:5432/alburhandb\nSTATIC_FILES_DIR=/var/www/alburhan/artifacts/alburhan/dist/public\nUPLOADS_DIR=/var/www/alburhan/uploads\nCORS_ORIGIN=https://alburhantravels.com,https://www.alburhantravels.com\nFAST2SMS_API_KEY=XXSL5mI3wO9piOG62Va1lJyvd4JCECMXhzXm7dD7Y2JKydynma6IADpu1vcb\nRAZORPAY_KEY_ID=rzp_live_SOMX9rmgXZroTD\nRAZORPAY_SECRET=RN7dX2d86mdRrG5qNz2dY5BG\nBOTBEE_API_KEY=18586|wNNF04uDdR6fFHZwBPpcPQcMDQJ1yqauLNaxWkHP6eaed2ba\nBOTBEE_BUSINESS_ID=2322353164933958\nBOTBEE_PHONE_NUMBER_ID=+918989701701 \nSESSION_SECRET=Y29ZSfR6hCqoCXmGxoLH1gcYyg/1X7KZV7w9s4GoK9lViBwJKx0LZXT8Brf/H0rxokXM7wipiL3OEQ82jHaY7w=='
with open('/var/www/alburhan/.env', 'w') as f:
    f.write(content + '\n')
print('.env written successfully')
print('Keys:', [l.split('=')[0] for l in content.split('\n') if '=' in l])

# Restart with env loaded
env = dict(os.environ)
for line in content.split('\n'):
    if '=' in line and not line.startswith('#'):
        k,v = line.split('=',1)
        env[k.strip()] = v.strip()

subprocess.run(['pm2','restart','api-server'], env=env, cwd='/var/www/alburhan')
subprocess.run(['pm2','save'], cwd='/var/www/alburhan')
print('Server restarted')

import time, urllib.request
time.sleep(3)
try:
    r = urllib.request.urlopen('http://localhost:5000/api/auth/send-otp', 
        data=b'{"mobile":"test"}',
        timeout=5)
    print('OTP endpoint:', r.read()[:100])
except Exception as e:
    print('OTP endpoint response:', str(e)[:100])
