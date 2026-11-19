"""Compare decoded audio before and after an editor operation using real media files."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
args = parser.parse_args()
ffmpeg = shutil.which('ffmpeg')
ffprobe = shutil.which('ffprobe')
if not ffmpeg or not ffprobe:
    raise RuntimeError('ffmpeg and ffprobe must be available on PATH')
results = {}
for name, path in [('before', args.before), ('after', args.after)]:
    metadata = json.loads(subprocess.run([ffprobe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], capture_output=True, text=True, check=True).stdout)
    audio = [stream for stream in metadata['streams'] if stream['codec_type'] == 'audio']
    if len(audio) != 1:
        raise RuntimeError(f'{name}: expected one audio stream, got {len(audio)}')
    digest = subprocess.run([ffmpeg, '-v', 'error', '-i', str(path), '-map', '0:a:0', '-c:a', 'pcm_s16le', '-f', 'hash', '-hash', 'sha256', '-'], capture_output=True, text=True, check=True).stdout.strip()
    results[name] = {'sample_rate': audio[0]['sample_rate'], 'channels': audio[0]['channels'], 'pcm_sha256': digest, 'duration': metadata['format']['duration']}
if results['before'] != results['after']:
    raise RuntimeError('Decoded audio or duration changed: ' + json.dumps(results))
print(json.dumps({'decoded_audio_identical': True, 'files': results}, indent=2))
