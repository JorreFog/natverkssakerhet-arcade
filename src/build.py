#!/usr/bin/env python3
"""Bygger den fristående spelfilen ../index.html (och en lokal kopia ../Natverkssakerhet-Arcade.html) av delarna i src/.

Kräver node_modules (npm install i src/) för three.js + esbuild.
Musiken läses från src/music.mp3 (byt fil och bygg om för en annan låt).
"""
import base64, glob, os, re, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(os.path.join(here, p), encoding="utf8").read()
b64 = lambda p: base64.b64encode(open(os.path.join(here, p), "rb").read()).decode()

qs = "\n".join(rd(os.path.basename(f)) for f in sorted(glob.glob(os.path.join(here, "q[0-9]*.js"))))
n = len(re.findall(r"^Q\(", qs, re.M))
if n != 300:
    sys.exit(f"Förväntade 300 frågor, hittade {n}")

esb = os.path.join(here, "node_modules", ".bin", "esbuild")
bundle = subprocess.run([esb, os.path.join(here, "scene3d.js"), "--bundle", "--format=iife", "--minify", "--target=es2020", "--log-level=warning"],
                        cwd=here, check=True, capture_output=True, text=True).stdout

def safe(js):  # never let inline code close the <script> tag
    return js.replace("</script", "<\\/script")

music = b64("music.mp3") if os.path.exists(os.path.join(here, "music.mp3")) else ""
html = rd("template.html")
for key, val in (("__PS2P__", b64("fonts/ps2p.woff2")), ("__VT323__", b64("fonts/vt323.woff2")), ("__MUSIC__", music),
                 ("/*__BUNDLE__*/", safe(bundle)), ("/*__SPRITES__*/", safe(rd("sprites.js"))), ("/*__AUDIO__*/", safe(rd("audio.js"))),
                 ("/*__GAME__*/", safe(rd("game.js"))), ("/*__QUESTIONS__*/", safe(qs))):
    assert key in html, key
    html = html.replace(key, val, 1)
out = os.path.join(here, "..", "index.html")                      # GitHub Pages
open(out, "w", encoding="utf8").write(html)
open(os.path.join(here, "..", "Natverkssakerhet-Arcade.html"), "w", encoding="utf8").write(html)   # local copy (git-ignored)
print(f"OK: {n} frågor, 3D-bundle {len(bundle)//1024} kB, musik {len(music)//1024} kB, totalt {len(html)//1024} kB -> {os.path.normpath(out)}")
