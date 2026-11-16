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
css = ('<style>/* arcade copy: keep clear of the arcade close X (top-left) */header{padding-left:46px;min-height:40px}'
       '@media (orientation:landscape) and (max-height:540px){.app{padding-left:52px}}'
       # Dave t874u: the game options sit UNDER the board on every screen (not beside it). Board sized so board + options fit the screen.
       '/* arcade copy: options at the bottom (Dave t874u) */'
       ':root{--ph:214px;--sz:min(96vw, calc(100vh - var(--ph) - 118px), 640px)}'
       '@supports (height:100dvh){:root{--sz:min(96vw, calc(100dvh - var(--ph) - 118px), 640px)}}'
       '.app{max-width:none;padding-bottom:8px}main{flex-direction:column;flex-wrap:nowrap;align-items:center;justify-content:flex-start;gap:8px}'
       '.board-col{flex:none}'
       'aside.panel{flex:none;width:min(96vw,900px);max-width:none;max-height:none;overflow:visible;padding:8px;gap:6px;display:grid;'
       'grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-areas:"st set" "btn btn" "mh mv";align-items:start}'
       '.status{grid-area:st;min-height:44px;padding:6px 10px;font-size:15px}details.settings{grid-area:set}details.settings[open]{grid-column:1/-1;grid-row:auto}'
       '.row.btns{grid-area:btn;display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:6px}.row.btns .btn{font-size:13px;padding:8px 4px}'
       '.movehead{grid-area:mh;flex-wrap:wrap;gap:6px}.moves{grid-area:mv;min-height:44px;max-height:88px}.hint{display:none}'
       '.row.fields{grid-template-columns:repeat(3,minmax(0,1fr))}'
       '@media (max-width:760px){:root{--ph:326px;--sz:min(96vw, calc(100vh - var(--ph) - 142px))}@supports (height:100dvh){:root{--sz:min(96vw, calc(100dvh - var(--ph) - 142px))}}aside.panel{width:96vw;grid-template-areas:"st set" "btn btn" "mh mh" "mv mv"}.moves{max-height:56px}.row.fields{grid-template-columns:1fr 1fr}.row.btns{grid-template-columns:repeat(3,minmax(0,1fr))}.row.btns .btn{font-size:14px}}'
       # landscape phone: one slim options row (status | buttons | settings) under the board; moves list hidden for room
       '@media (orientation:landscape) and (max-height:540px){:root{--ph:58px;--sz:min(calc(100vh - var(--ph) - 82px), 96vw)}'
       '@supports (height:100dvh){:root{--sz:min(calc(100dvh - var(--ph) - 82px), 96vw)}}'
       '.app{padding:4px 8px}main{gap:4px}.pbar{min-height:26px}'
       'aside.panel{width:min(calc(100vw - 112px),900px);grid-template-columns:auto minmax(0,1fr) minmax(0,170px);grid-template-areas:"st btn set";padding:4px;gap:6px;align-items:center}'
       '.status{min-height:40px;font-size:13px;white-space:nowrap;max-width:190px;overflow:hidden}details.settings summary{min-height:40px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;line-height:40px}'
       '.row.btns{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin}.row.btns .btn{flex:1 0 auto;min-height:40px;min-width:70px;font-size:13px}.movehead,.moves{display:none}}</style>')
s = inject(s, N, 'arcade:guard', '<title>Chess</title>', '<title>Chess</title>' + guard)
s = inject(s, N, 'arcade:css', '</head>', css + '</head>')   # after the game's own <style> so it wins
# options bar under the board: the settings fold away on every screen (the summary line still shows them; tap to open)
s = inject(s, N, 'arcade:settings-folded', "$('settings').open = window.innerWidth > 760 && window.innerHeight > 540;", "$('settings').open = false; /* arcade copy: options under the board (t874u) */")
verify(s, N, ['options at the bottom (Dave t874u)', 'arcade_chess.save.v2', 'arcade_chess.prefs.v1', 'arcade: off-site request blocked', 'engine-src'])
os.makedirs('chess-play', exist_ok=True)
open('chess-play/index.html', 'w').write(s)
print('ok', len(s))
