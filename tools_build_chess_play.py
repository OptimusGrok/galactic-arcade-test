# Builds chess-play/index.html: the Chess game for the shop's CHESS TABLE (between the ACCESSORIES island and the pool tables),
# from /workspace/chess/chess.html (live https://optimusgrok.github.io/chess/, repo OptimusGrok/chess, owned by Arcade).
# That file is READ ONLY: this builder only reads it (run /workspace/chess/build.sh there first if its src changed).
# Arcade copy only: same medieval pieces, capture battles and robot hand; its own storage keys (arcade_chess.*), no off-site
# requests, and room for the arcade's close X in the top-left. Rerun on every Chess update.
import re, sys, os, hashlib
sys.path.insert(0, 'tools'); from hooks import inject, require, verify, fail
N = 'chess'; SRC = '/workspace/chess/chess.html'
s = open(SRC).read()
sys.stderr.write(f'note [{N}]: source sha1 {hashlib.sha1(s.encode()).hexdigest()[:12]}\n')
s = re.sub(r'<link rel="(manifest|apple-touch-icon|icon)"[^>]*>', '', s)
urls = [u for u in re.findall(r'https?://[^\s"\')<]+', s) if not u.startswith('http://www.w3.org/')]
if urls: fail(N, 'offline', f'original now loads {urls[:3]}')
for h, pat in [('api:keys', r"var SAVE_KEY = 'chess\.save\.v2', PREF_KEY = 'chess\.prefs\.v1';"),
               ('api:engine', r'<script id="engine-src">'),
               ('api:mode', r'<select id="mode"><option value="hvc">vs Computer</option>'),
               ('api:robot', r'<select id="robot">'),
               ('api:battles', r'<select id="battles">'),
               ('api:title', r'<title>Chess</title>')]:
    require(s, N, h, pat)
s = s.replace("var SAVE_KEY = 'chess.save.v2', PREF_KEY = 'chess.prefs.v1';", "var SAVE_KEY = 'arcade_chess.save.v2', PREF_KEY = 'arcade_chess.prefs.v1';")
if re.search(r"'chess\.(save|prefs)", s): fail(N, 'storage keys', 'a non-isolated key remains')
guard = open('tools_play_guard.html').read().replace("||x.origin==='https://kfupqtafhaflzaoqtenf.supabase.co'", "")
assert 'supabase' not in guard
css = ('<style>/* arcade copy: keep clear of the arcade close X (top-left) */header{padding-left:46px}'
       '@media (orientation:landscape) and (max-height:540px){.app{padding-left:52px}}</style>')
s = inject(s, N, 'arcade:guard', '<title>Chess</title>', '<title>Chess</title>' + guard)
s = inject(s, N, 'arcade:css', '</head>', css + '</head>')   # after the game's own <style> so it wins
verify(s, N, ['arcade_chess.save.v2', 'arcade_chess.prefs.v1', 'arcade: off-site request blocked', 'engine-src'])
os.makedirs('chess-play', exist_ok=True)
open('chess-play/index.html', 'w').write(s)
print('ok', len(s))
