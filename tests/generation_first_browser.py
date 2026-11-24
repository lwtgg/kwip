"""Verify SSR/browser against an unmodified, read-only capture of a live R2 generation.

python tests/generation_first_browser.py .output /path/to/capture
Capture contains current.json and payload.bin; no credentials are read by this test.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import tempfile
from playwright.sync_api import sync_playwright
from click_under_browser import worker


def expand(values, index):
    if index < 0:
        return None
    value = values[index]
    if isinstance(value, dict):
        return {key: expand(values, ref) for key, ref in value.items()}
    if isinstance(value, list):
        return [expand(values, ref) for ref in value]
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('capture', type=Path)
    parser.add_argument('--strip-refresh-match', action='store_true', help='Negative control: must fail after refresh')
    args = parser.parse_args()
    manifest = json.loads((args.capture / 'current.json').read_text())
    packed = (args.capture / 'payload.bin').read_bytes()
    assert len(packed) == manifest['size']
    uri = 'ucl/2026-11-24/bodo-las'
    endpoint = next(entry for entry in manifest['endpoints'] if entry['path'] == f'streams/{uri}')
    expected = json.loads(packed[endpoint['offset']:endpoint['offset'] + endpoint['length']])['data']['match']
    with tempfile.TemporaryDirectory(prefix='kwip-generation-') as temp, sync_playwright() as pw:
        directory = Path(temp)
        wrapped = directory / 'output'
        shutil.copytree(args.output.resolve(), wrapped)
        capture = wrapped / 'public/__generation'
        capture.mkdir()
        shutil.copy(args.capture / 'current.json', capture)
        shutil.copy(args.capture / 'payload.bin', capture)
        entry = wrapped / 'server/index.mjs'
        entry.rename(entry.with_name('original.mjs'))
        entry.write_text('''import worker from './original.mjs'
export default { fetch(request, env, ctx) {
  const bucket = { async get(key, options) {
    const file = key === 'current.json' ? 'current.json' : 'payload.bin'
    const object = await env.ASSETS.fetch(new Request(new URL('/__generation/' + file, request.url)))
    if (!object.ok) return null
    const bytes = await object.arrayBuffer()
    const range = options?.range
    const body = new Response(range ? bytes.slice(range.offset, range.offset + range.length) : bytes)
    return { size: bytes.byteLength, etag: key, body: body.body, arrayBuffer: () => body.arrayBuffer() }
  } }
  return worker.fetch(request, { ...env, FEED_SNAPSHOTS: bucket }, ctx)
} }
''')
        browser = pw.chromium.launch()
        with worker(directory, 'live-generation', wrapped, '', False,
                    variables=lambda origin: {'NUXT_PUBLIC_FEED_BASE': '/api/feed'}) as origin:
            for width in (390, 1280):
                with browser.new_context(viewport={'width': width, 'height': 850}, java_script_enabled=False) as context:
                    page = context.new_page()
                    response = page.goto(origin + '/live/' + uri)
                    assert response.status == 200
                    # Read the actual SSR hydration payload with JavaScript disabled.
                    values = json.loads(page.locator('#__NUXT_DATA__').text_content())
                    details = [expand(values, i) for i, value in enumerate(values)
                               if isinstance(value, dict) and 'detailGeneration' in value]
                    assert any(detail.get('detailGeneration') == manifest['commitId'] and
                               detail['data'].get('match') == expected for detail in details), details
                    assert page.locator('h1').inner_text()
                with browser.new_context(viewport={'width': width, 'height': 850}) as context:
                    page = context.new_page()
                    provider_requests = []
                    page.on('request', lambda request: provider_requests.append(request.url)
                            if re.search(r'api\.ppv\.(st|cx)/api/', request.url) else None)
                    page.goto(origin + '/live/' + uri)
                    page.wait_for_load_state('networkidle')
                    probe = """() => Object.entries(document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.payload.data)
                      .filter(([key]) => key.startsWith('feed:stream:'))
                      .map(([key, value]) => ({key, match: value?.data?.match, generation: value?.detailGeneration}))"""
                    def assert_payload(stage):
                        state = page.evaluate(probe)
                        assert state and all(item.get('match') == expected and
                            item.get('generation') == manifest['commitId'] for item in state), (stage, state)
                        print(f'{width}px {stage}: {state}', flush=True)
                    assert_payload('hydrated')
                    refresh_requests = []
                    def refresh_route(route):
                        refresh_requests.append(route.request.url)
                        response = route.fetch()
                        if args.strip_refresh_match:
                            body = response.json()
                            body.get('data', {}).pop('match', None)
                            route.fulfill(response=response, json=body)
                        else:
                            route.fulfill(response=response)
                    page.route('**/api/feed/streams/**', refresh_route)
                    refresh = """async () => {const n=document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt;
                      await n.callHook('app:data:refresh', Object.keys(n.payload.data).filter(k=>k.startsWith('feed:')))}"""
                    page.evaluate(refresh)
                    assert refresh_requests, 'Refresh did not reach the feed route'
                    assert_payload('refreshed')
                    # Cross a full 60-second cache bucket, then refresh the mounted client again.
                    page.wait_for_timeout(45000)
                    page.wait_for_timeout(45000)
                    assert_payload('90 seconds')
                    page.evaluate(refresh)
                    assert_payload('refresh after bucket')
                    result = page.request.get(origin + '/api/feed/streams/' + uri)
                    assert result.status == 200
                    assert result.headers['cache-control'] == 'no-store'
                    assert 'application/json' in result.headers['content-type']
                    assert result.json()['data']['match'] == expected
                    for path in ('streams', 'streams/' + uri, 'streams/not-in-this-generation', 'invalid'):
                        get = page.request.get(origin + '/api/feed/' + path)
                        head = page.request.head(origin + '/api/feed/' + path)
                        assert head.status == get.status, (path, get.status, head.status)
                        assert head.headers['cache-control'] == 'no-store'
                        assert head.body() == b''
                    omitted = page.request.get(origin + '/api/feed/streams/not-in-this-generation')
                    assert omitted.status == 404 and omitted.json()['success'] is False
                    assert not provider_requests, provider_requests
                print(f'{width}px SSR and browser match generation {manifest["commitId"]}: {expected}', flush=True)
        browser.close()


if __name__ == '__main__':
    main()
