"""Refresh browser policies for maintained pages; do not publish QA or local notes.

Run after editing an inline script: python .github/scripts/update-security.py
Validate without writing: python work/harden-site.py --check
"""
from pathlib import Path
import base64
import hashlib
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = re.compile(r'<script\b([^>]*)>(.*?)</script\s*>', re.I | re.S)
CSP = re.compile(r'\s*<meta\s+http-equiv="Content-Security-Policy"[^>]*>', re.I)
REFERRER = re.compile(r'\s*<meta\s+name="referrer"[^>]*>', re.I)

def harden(path, text):
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = CSP.sub('', text)
    text = REFERRER.sub('', text)
    # The policy must precede the legacy edition's intentional same-origin base.
    text = text.replace('<head><base href="../"><meta charset="utf-8">',
                        '<head><meta charset="utf-8"><base href="../">')
    hashes = []
    for attrs, body in SCRIPT.findall(text):
        if re.search(r'\bsrc\s*=', attrs, re.I) or not body.strip():
            continue
        digest = base64.b64encode(hashlib.sha256(body.encode('utf-8')).digest()).decode()
        hashes.append("'sha256-" + digest + "'")
    solar = path.name == 'solar-system.html'
    images = "'self' data:"
    connect = "'self'"
    if solar:
        images += ' https://cdn.star.nesdis.noaa.gov https://epic.gsfc.nasa.gov'
        connect += (' https://api.wheretheiss.at https://services.swpc.noaa.gov'
                    ' https://www.star.nesdis.noaa.gov https://epic.gsfc.nasa.gov')
    policy = '; '.join([
        "default-src 'self'",
        "script-src 'self'" + (' ' + ' '.join(hashes) if hashes else ''),
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline'",
        'img-src ' + images,
        'connect-src ' + connect,
        "media-src 'self'", "font-src 'self'", "object-src 'none'",
        "frame-src 'none'", "worker-src 'none'", "base-uri 'self'",
        "form-action 'self'"
    ])
    tags = ('\n  <meta http-equiv="Content-Security-Policy" content="' + policy + '" />'
            '\n  <meta name="referrer" content="no-referrer" />')
    charset = re.search(r'<meta\s+charset=[^>]+>', text, re.I)
    if not charset:
        raise ValueError('Missing charset in ' + str(path))
    return text[:charset.end()] + tags + text[charset.end():]

def main():
    paths = sorted(ROOT.glob('*.html')) + [ROOT / 'queen-1/queen-survivor.html']
    changed = []
    for path in paths:
        text = path.read_text(encoding='utf-8-sig')
        updated = harden(path, text)
        if updated != text:
            changed.append(str(path.relative_to(ROOT)))
            if '--check' not in sys.argv:
                path.write_text(updated, encoding='utf-8', newline='\n')
    print(('Policies need refresh: ' if '--check' in sys.argv else 'Hardened: ') + ', '.join(changed))
    print(f'Checked {len(paths)} maintained pages. Archived backup HTML is unchanged.')
    return int('--check' in sys.argv and bool(changed))

if __name__ == '__main__':
    sys.exit(main())
