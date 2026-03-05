import re
import urllib.request
import urllib.error
import ssl
import time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

with open('/Users/jonasschilberg/.gemini/antigravity/scratch/opernlog/src/data/operaHouses.js', 'r', encoding='utf-8') as f:
    content = f.read()

urls = re.findall(r"imageUrl:\s*'([^']+)'", content)
print(f"Checking {len(urls)} URLs...")

broken = []
for i, url in enumerate(urls):
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        response = urllib.request.urlopen(req, context=ctx, timeout=10)
        print(f"[{i+1}/{len(urls)}] OK: {url}")
    except urllib.error.HTTPError as e:
        print(f"[{i+1}/{len(urls)}] HTTP Error {e.code}: {url}")
        if e.code != 429: # ignore 429 too many requests for broken check
            broken.append(url)
    except Exception as e:
        print(f"[{i+1}/{len(urls)}] Error {e}: {url}")
        broken.append(url)
    time.sleep(1)

print("\n--- Broken URLs ---")
for b in broken:
    print(b)
print("Done.")
