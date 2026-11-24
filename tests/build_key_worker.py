"""Two real builds sharing caches.default: python3 tests/build_key_worker.py [--expect-broken].

Requires pnpm/ Wrangler. Stops Wrangler before every build. Restores the temporary
CSS token in finally; the token only forces a different entry hash in build two.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expect-broken', action='store_true')
    parser.add_argument('--artifacts', type=Path, required=True)
    parser.add_argument('--baseline', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    os.chdir(root)
    args.artifacts.mkdir(parents=True, exist_ok=True)
    artifacts = args.artifacts.resolve()
    output = root / '.output'
    theme = root / 'app/assets/css/theme.css'
    original = theme.read_bytes()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    origin = f'http://127.0.0.1:{port}'
    with tempfile.TemporaryDirectory(prefix='kwip-build-key-') as tmp:
        directory = Path(tmp)
        config = directory / 'wrangler.toml'
        config.write_text(f'''name = "kwip-build-key-proof"
main = {json.dumps(str(output / 'server/index.mjs'))}
compatibility_date = "2025-07-15"
compatibility_flags = ["nodejs_compat"]
[assets]
binding = "ASSETS"
directory = {json.dumps(str(output / 'public'))}
[vars]
NUXT_PUBLIC_FEED_BASE = "/api/feed"
NUXT_PUBLIC_FEED_MIRROR_BASE = ""
[[r2_buckets]]
binding = "FEED_SNAPSHOTS"
bucket_name = "kwip-build-key-feed"
''')
        command = ['pnpm', 'exec', 'wrangler', 'dev', '--config', str(config), '--port', str(port),
                   '--ip', '127.0.0.1', '--inspector-port', '0', '--persist-to', str(directory / 'state')]
        def request(label):
            with urlopen(Request(origin + '/vods', headers={'cf-ray': 'build-key-proof'}), timeout=30) as response:
                html = response.read().decode()
                headers = dict(response.headers)
                cache = response.headers.get('x-kwip-cache')
            (artifacts / f'{label}.html').write_text(html)
            (artifacts / f'{label}.headers.json').write_text(json.dumps(headers, indent=2))
            css = re.search(r'/_nuxt/entry\.[^"<>\s]+\.css', html)
            assert css, f'No entry CSS in {label}'
            asset = css.group()
            live = (output / 'public' / asset.lstrip('/')).exists()
            result = dict(request=label, cache=cache, css=asset, exists=live)
            print(json.dumps(result), flush=True)
            return result
        def serve(stage):
            with (artifacts / f'{stage}-wrangler.log').open('w') as log:
                process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                try:
                    for _ in range(150):
                        if process.poll() is not None:
                            raise RuntimeError('Wrangler exited; see log')
                        try:
                            with urlopen(origin + '/fixtures/streams.json', timeout=1):
                                break
                        except Exception:
                            time.sleep(.2)
                    else:
                        raise RuntimeError('Wrangler readiness timeout')
                    if stage == 'first':
                        first = request('warm-miss')
                        assert first['cache'] == 'miss' and first['exists']
                        time.sleep(1)
                        hit = request('warm-hit')
                        assert hit['cache'] == 'hit' and hit['css'] == first['css']
                        return first
                    second = request('after-build')
                    time.sleep(1)
                    third = request('third-request')
                    return second, third
                finally:
                    os.killpg(process.pid, signal.SIGTERM)
                    process.wait(timeout=20)
        def build(label):
            print('COMMAND: pnpm build (' + label + ')', flush=True)
            with (artifacts / f'{label}-build.log').open('w') as log:
                subprocess.run(['pnpm', 'build'], stdout=log, stderr=subprocess.STDOUT, check=True)
            metadata = json.loads((output / 'nitro.json').read_text())
            metadata['buildIds'] = sorted(file.stem for file in (output / 'public/_nuxt/builds/meta').glob('*.json'))
            print('BUILD: ' + json.dumps(metadata), flush=True)
            assert len(metadata['buildIds']) == 1
            return metadata['buildIds'][0]
        try:
            first_build = build('first')
            commit = '20261124T000000Z-01234567'
            packed = b''
            endpoints = []
            for path in ('streams', 'vods'):
                payload = (root / f'public/fixtures/{path}.json').read_bytes()
                endpoints.append(dict(path=path, offset=len(packed), length=len(payload)))
                packed += payload
            date = '2026-11-24T00:00:00.000Z'
            manifest = dict(schema=1, commitId=commit, payloadId=commit,
                            payloadKey=f'snapshots/{commit}.bin', publishedAt=date,
                            listsVerifiedAt=date, detailsVerifiedAt=date,
                            size=len(packed), endpoints=endpoints)
            for key, data in [('current.json', json.dumps(manifest).encode()), (manifest['payloadKey'], packed)]:
                file = directory / key.replace('/', '-')
                file.write_bytes(data)
                subprocess.run(['pnpm', 'exec', 'wrangler', 'r2', 'object', 'put',
                                'kwip-build-key-feed/' + key, '--local', '--config', str(config),
                                '--persist-to', str(directory / 'state'), '--file', str(file)],
                               check=True, stdout=subprocess.DEVNULL)
            if args.baseline:
                shutil.copytree(output, args.baseline, dirs_exist_ok=True)
            first = serve('first')
            theme.write_bytes(original + b'\n:root { --build-key-proof: 57; }\n')
            second_build = build('second')
            assert second_build != first_build, 'Build identity did not change'
            assert not (output / 'public' / first['css'].lstrip('/')).exists(), 'Old CSS survived rebuild'
            second, third = serve('second')
            if args.expect_broken:
                assert second['cache'] == 'hit' and not second['exists'] and second['css'] == first['css']
                assert third['cache'] == 'hit' and third['css'] == first['css']
                print('EXPECTED FAILURE: second build served a cache hit naming dead CSS', flush=True)
            else:
                assert second['cache'] == 'miss' and second['exists'] and second['css'] != first['css']
                assert third['cache'] == 'hit' and third['exists'] and third['css'] == second['css']
                print('PASS: second build missed; third request hit the live CSS', flush=True)
        finally:
            theme.write_bytes(original)


if __name__ == '__main__':
    main()
