import urllib.request, json, ssl, re, time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {'User-Agent': 'OperaLog-App/1.0 (https://opernlog.vercel.app; opernlog@example.com) python-urllib/3.x'}

def is_bad_image(url):
    if not url: return True
    lower = url.lower()
    bad_keywords = ['wappen', 'logo', 'flagge', 'karte', 'map', 'svg', 'signature', 'unterschrift', 'blank']
    return any(k in lower for k in bad_keywords)

def get_image_url(query):
    # Try exact match or search on DE Wikipedia
    search_url = f"https://de.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&prop=pageimages&pithumbsize=1200&format=json"
    req = urllib.request.Request(search_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, context=ctx) as r:
            data = json.loads(r.read())
            pages = data.get('query', {}).get('pages', {})
            
            sorted_pages = sorted(pages.values(), key=lambda x: x.get('index', 999))
            
            for page in sorted_pages:
                if 'thumbnail' in page and 'source' in page['thumbnail']:
                    img_url = page['thumbnail']['source']
                    if not is_bad_image(img_url):
                        return img_url
    except Exception as e:
        pass
    
    # Try EN wikipedia as fallback
    search_url = f"https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&prop=pageimages&pithumbsize=1200&format=json"
    req = urllib.request.Request(search_url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, context=ctx) as r:
            data = json.loads(r.read())
            pages = data.get('query', {}).get('pages', {})
            
            sorted_pages = sorted(pages.values(), key=lambda x: x.get('index', 999))
            for page in sorted_pages:
                if 'thumbnail' in page and 'source' in page['thumbnail']:
                    img_url = page['thumbnail']['source']
                    if not is_bad_image(img_url):
                        return img_url
    except Exception as e:
        pass

    return None

def process_file():
    with open('src/data/operas.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # Pattern to match: image: 'src/assets/operas/...'
    # We will replace the entire 'src/assets/operas/...' string with the wikipedia URL
    pattern = re.compile(r"(title:\s*'([^']+)',.*?image:\s*')src/assets/operas/[^']*('\s*})", re.DOTALL)
    
    new_content = content
    matches = pattern.findall(content)
    
    success_count = 0
    for match in matches:
        title = match[1]
        full_match_text = match[0] + "src/assets/operas/" + match[0].split('image: \'')[1][:0] # not reliable string building
        # Use simpler approach to replace line
        pass

    # A better regex that replaces the specific value
    # We want to find { ... id: 'foo', title: 'Bar' ... image: 'src/assets/operas/foo.png' }
    
    # Alternative: iterate line by line
    with open('src/data/operas.js', 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    new_lines = []
    
    # Match: title: 'La Bohème'
    title_pattern = re.compile(r"title:\s*'([^']+)'")
    # Match: image: 'src/assets/operas/la-boheme.png'
    image_pattern = re.compile(r"image:\s*'[^']+'")
    
    current_title = None
    
    for line in lines:
        title_match = title_pattern.search(line)
        if title_match:
            current_title = title_match.group(1)
            
        if current_title and "image:" in line and "src/assets/operas/" in line:
            print(f"[FETCH] Looking for {current_title}...")
            img_url = get_image_url(current_title + " opera")
            if not img_url:
                img_url = get_image_url(current_title)
                
            if img_url:
                print(f"   -> Found image: {img_url}")
                line = image_pattern.sub(f"image: '{img_url}'", line)
                success_count += 1
            else:
                print(f"   -> No image found")
            
            current_title = None # reset
            time.sleep(0.5)
            
        new_lines.append(line)

    with open('src/data/operas.js', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
        
    print(f"\\nFinished! Updated {success_count} operas with JSON image URLs.")

if __name__ == "__main__":
    process_file()
