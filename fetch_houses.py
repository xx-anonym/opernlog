import urllib.request
import json
import os
import re
import time

base_dir = os.path.dirname(os.path.abspath(__file__))
data_file = os.path.join(base_dir, 'src', 'data', 'operaHouses.js')
headers = {'User-Agent': 'OperaLog-App/1.0 (https://opernlog.vercel.app; opernlog@example.com) python-urllib/3.x'}

with open(data_file, 'r', encoding='utf-8') as f:
    content = f.read()

def is_bad_image(url):
    lower = url.lower()
    if 'wappen' in lower or 'coa' in lower or 'logo' in lower or 'flagge' in lower or '.svg' in lower or 'karte' in lower or 'map' in lower:
        return True
    return False

def fetch_wiki_image(title):
    url = f"https://de.wikipedia.org/w/api.php?action=query&prop=pageimages&titles={urllib.parse.quote(title)}&pithumbsize=1200&format=json"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            pages = data.get('query', {}).get('pages', {})
            for page_id, page_data in pages.items():
                if page_id == '-1': continue
                thumb = page_data.get('thumbnail')
                if thumb and 'source' in thumb:
                    src = thumb['source']
                    if not is_bad_image(src):
                        return src
    except Exception as e:
        pass
    return None

def fetch_en_wiki_image(title):
    url = f"https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles={urllib.parse.quote(title)}&pithumbsize=1200&format=json"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            pages = data.get('query', {}).get('pages', {})
            for page_id, page_data in pages.items():
                if page_id == '-1': continue
                thumb = page_data.get('thumbnail')
                if thumb and 'source' in thumb:
                    src = thumb['source']
                    if not is_bad_image(src):
                        return src
    except Exception as e:
        pass
    return None

import ast
pattern = re.compile(r"\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*city:\s*'([^']+)'")
houses = pattern.findall(content)

updates_made = 0
new_content = content

for house_id, house_name, house_city in houses:
    print(f"[FETCH] Looking for {house_name}...")
    
    # Check if already has image
    match = re.search(fr"id:\s*'{house_id}'.*?imageUrl:", new_content)
    if match:
        print(f"   -> [SKIP] Already has imageUrl")
        continue

    img_url = fetch_wiki_image(house_name)
    
    if not img_url:
        city_name = house_city.split('/')[0].strip()
        img_url = fetch_wiki_image(city_name + " Theater")
        if not img_url:
            img_url = fetch_wiki_image(city_name + " Oper")
        if not img_url:
            img_url = fetch_wiki_image(city_name)
        if not img_url:
            img_url = fetch_en_wiki_image(city_name)
        
    if img_url:
        print(f"   -> Found image: {img_url}")
        
        # Replace the entry string to append imageUrl
        # Find the specific entry
        entry_pattern = re.compile(fr"(id:\s*'{house_id}'.*?color:\s*'#[0-9a-fA-F]+')(\s*\}})")
        new_content = entry_pattern.sub(fr"\1, imageUrl: '{img_url}'\2", new_content)
        updates_made += 1
    else:
        print(f"   -> No image found")
        
    time.sleep(0.3)

with open(data_file, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"\nFinished! Updated {updates_made} houses with JSON image URLs.")
