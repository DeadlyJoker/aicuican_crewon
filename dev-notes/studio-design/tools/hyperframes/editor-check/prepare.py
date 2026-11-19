"""Copy only missing qualification fixtures; never reset an edited project."""
from pathlib import Path
import json
import shutil

root = Path(__file__).resolve().parent
project = root / 'project'
project.mkdir(exist_ok=True)
lock = json.loads((root / 'package-lock.json').read_text())
expected = lock['packages']['node_modules/gsap']['version']
gsap = root / 'node_modules/gsap'
if json.loads((gsap / 'package.json').read_text())['version'] != expected:
    raise RuntimeError('Installed GSAP does not match the locked version')
fixtures = {
    root.parent / 'test-pattern.mp4': project / 'test-pattern.mp4',
    root.parent.parent / 'fixtures/panorama-calibration.png': project / 'calibration.png',
    gsap / 'dist/gsap.min.js': project / 'gsap.min.js',
}
for source, destination in fixtures.items():
    if not source.is_file():
        raise FileNotFoundError(source)
    if not destination.exists():
        shutil.copyfile(source, destination)
notice = project / 'GSAP-NOTICE.txt'
if not notice.exists():
    notice.write_text('GSAP ' + expected + '\n' + json.loads((gsap / 'package.json').read_text())['license'] + '\nThe distributed runtime retains its original copyright and license header.\nThis notice is not a replacement for the upstream license.\n')
print('Qualification assets ready; existing project files retained')
