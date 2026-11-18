#!/usr/bin/env python3
"""Build index.html: the shell with the game sources, the sound engine bundle and its worklet inlined.
Edit src/ and vendor/, then run this; never hand-edit index.html."""
import glob, os, re, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(root, p), encoding='utf8').read()
shell = rd('src/shell.html')
game = '\n'.join(rd(os.path.relpath(p, root)) for p in sorted(glob.glob(os.path.join(root, 'src', '[0-9]*.js'))))
engine, worklet = rd('vendor/sound-engine.js'), rd('vendor/sound-worklet.js')
for name, txt in (('game', game), ('engine', engine), ('worklet', worklet)):
    if re.search(r'</script', txt, re.I): sys.exit(f'build: {name} contains a closing script tag')
out = shell.replace('/*@WORKLET@*/', worklet).replace('/*@ENGINE@*/', engine).replace('/*@GAME@*/', game)
with open(os.path.join(root, 'game.check.js'), 'w', encoding='utf8') as f: f.write(game)
r = subprocess.run(['node', '--check', os.path.join(root, 'game.check.js')], capture_output=True, text=True)
os.remove(os.path.join(root, 'game.check.js'))
if r.returncode: sys.exit('build: syntax error\n' + r.stderr)
open(os.path.join(root, 'index.html'), 'w', encoding='utf8').write(out)
print(f'build: index.html {len(out)} bytes')
