"""Copy pinned public runtime artifacts only, verifying npm SHA-512 before reading archives."""
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
from urllib.request import urlopen

root = Path(__file__).resolve().parents[2] / 'vendor' / 'hyperframes'
root.mkdir(parents=True, exist_ok=True)
manifest = {'version': '0.9.30', 'packages': {}, 'artifacts': {}}
for name, entry in [('player', 'hyperframes-player.global.js'), ('core', 'hyperframe.runtime.iife.js')]:
    metadata = json.load(urlopen(f'https://registry.npmjs.org/@hyperframes/{name}/0.9.30'))
    archive = urlopen(metadata['dist']['tarball']).read()
    actual = 'sha512-' + base64.b64encode(hashlib.sha512(archive).digest()).decode()
    if actual != metadata['dist']['integrity']:
        raise RuntimeError('npm integrity mismatch: ' + name)
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as package:
        for source, target in [('package/dist/' + entry, entry), ('package/LICENSE', name + '-LICENSE')]:
            data = package.extractfile(source).read()
            (root / target).write_bytes(data)
            manifest['artifacts'][target] = hashlib.sha256(data).hexdigest()
    manifest['packages'][name] = {'tarball': metadata['dist']['tarball'], 'integrity': actual, 'entry': entry}
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Copied pinned player and runtime with npm integrity and original licenses.')
