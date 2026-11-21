"""Run from the repo root after pnpm build.

    python tests/sourceHealth_browser.py .output
"""
import argparse
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import shutil
from pathlib import Path
import tempfile
from threading import Event, Thread
from time import monotonic, time
from urllib.parse import quote, urlsplit

from playwright.sync_api import expect, sync_playwright

from click_under_browser import EVENT, worker


def check_source_health(browser, origin):
    with browser.new_context() as context:
        hold_first = True
        first_requests = []
        frame_requests = []

        def intercept(route):
            url = route.request.url
            if not url.startswith(origin + '/'):
                route.abort()
            elif urlsplit(url).path == '/fixtures/one' and hold_first:
                first_requests.append(route)
            elif urlsplit(url).path in ('/fixtures/one', '/fixtures/two'):
                route.fulfill(body='<h1>Playable fixture</h1>', content_type='text/html')
            elif urlsplit(url).path == '/fixtures/poster-1.jpg':
                route.fulfill(status=302, headers={'location': origin + '/og-default.jpg'})
            else:
                route.continue_()

        context.route('**/*', intercept)
        page = context.new_page()
        errors = []
        page.on('request', lambda request: frame_requests.append(request.url) if request.resource_type == 'document' else None)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        response = page.goto(origin + EVENT, wait_until='domcontentloaded')
        assert response.ok
        html = response.text()
        startup_html = re.sub(r'<noscript[^>]*>.*?</noscript>', '', html, flags=re.S)
        assert not re.search(r'<iframe\b', startup_html)
        assert 'Loading player embed' in startup_html
        assert f'<iframe src="{origin}/fixtures/one"' in html
        assert '/fixtures/poster-1.jpg"' in html
        chips = page.get_by_role('group', name='Playback source')
        first = chips.get_by_role('button', name='First embed', exact=True)
        failed = chips.get_by_role('button', name='First embed, Failed to load', exact=True)
        second = chips.get_by_role('button', name='Second embed', exact=True)
        frame = page.locator('iframe')
        first_url = origin + '/fixtures/one'
        second_url = origin + '/fixtures/two'

        expect(first).to_have_attribute('aria-pressed', 'true')
        expect(frame).to_have_count(1)
        expect(frame).to_have_attribute('src', first_url)
        poster = page.get_by_role('region', name='Event player').locator('img[src$="/fixtures/poster-1.jpg"]')
        expect(poster).to_be_visible()
        poster.evaluate('image => image.decode()')
        original_order = chips.get_by_role('button').evaluate_all('buttons => buttons.map(button => button.value)')
        frame.dispatch_event('error')
        expect(failed).to_contain_text(' · Failed')
        expect(second).to_have_attribute('aria-pressed', 'true')
        expect(frame).to_have_attribute('src', second_url)
        expect(page.frame_locator('iframe').get_by_text('Playable fixture')).to_be_visible()
        expect(poster).to_have_count(0)
        assert len(first_requests) == 1

        hold_first = False
        with page.expect_request(lambda request: request.url == second_url):
            page.reload(wait_until='domcontentloaded')
        expect(failed).to_have_attribute('aria-pressed', 'false')
        expect(second).to_have_attribute('aria-pressed', 'true')

        storage_key = 'source-health:v1:' + EVENT.removeprefix('/live/')
        second_key = second.get_attribute('value')
        page.evaluate('''([entry, key]) => {
            const current = JSON.parse(sessionStorage.getItem(entry));
            current.keys.unshift(key);
            sessionStorage.setItem(entry, JSON.stringify(current));
        }''', [storage_key, second_key])
        page.reload(wait_until='networkidle')
        expect(chips.get_by_role('button', name='Second embed, Failed to load', exact=True)).to_have_attribute('aria-pressed', 'false')
        expect(chips.get_by_role('button', name='External fixture', exact=True)).to_have_attribute('aria-pressed', 'true')
        page.evaluate('''entry => {
            const current = JSON.parse(sessionStorage.getItem(entry));
            current.keys.shift();
            sessionStorage.setItem(entry, JSON.stringify(current));
        }''', storage_key)

        page.reload(wait_until='networkidle')
        expect(second).to_have_attribute('aria-pressed', 'true')
        second.click()
        page.wait_for_function('history.state.automaticSource === null')

        # Revisit without the query written by failover to exercise default selection.
        frame_requests.clear()
        page.goto(origin + EVENT, wait_until='networkidle')
        expect(failed).to_have_attribute('aria-pressed', 'false')
        expect(second).to_have_attribute('aria-pressed', 'true')
        expect(frame).to_have_attribute('src', second_url)
        assert [url for url in frame_requests if url in (first_url, second_url)] == [second_url], frame_requests
        assert chips.get_by_role('button').evaluate_all('buttons => buttons.map(button => button.value)') == original_order
        previous_frame = frame.element_handle()
        failed.click()
        expect(failed).to_have_count(0)
        expect(first).to_have_attribute('aria-pressed', 'true')
        expect(frame).to_have_attribute('src', first_url)
        assert not previous_frame.evaluate('element => element.isConnected')

        assert page.evaluate('key => sessionStorage.getItem(key)', storage_key) is None
        first_key = first.get_attribute('value')
        page.evaluate('''([entry, key]) => sessionStorage.setItem(entry,
            JSON.stringify({ at: Date.now(), keys: [key, 'unknown'] }))''', [storage_key, first_key])
        frame_requests.clear()
        page.goto(origin + EVENT + '?source=' + quote(first_key), wait_until='networkidle')
        expect(first).to_have_attribute('aria-pressed', 'true')
        expect(failed).to_have_count(0)
        assert page.evaluate('key => JSON.parse(sessionStorage.getItem(key)).keys', storage_key) == ['unknown']
        assert frame_requests.count(first_url) == 1, frame_requests
        assert not errors, errors

    with browser.new_context() as fresh:
        fresh.route('**/*', intercept)
        page = fresh.new_page()
        page.goto(origin + EVENT, wait_until='networkidle')
        expect(page.get_by_role('button', name='First embed', exact=True)).to_have_attribute('aria-pressed', 'true')
        expect(page.get_by_text(' · Failed')).to_have_count(0)
    with browser.new_context() as remembered:
        remembered.route('**/*', intercept)
        remembered.add_init_script(f"""(() => {{
            if (location.pathname !== {EVENT!r}) return;
            const key = {storage_key!r};
            sessionStorage.setItem(key, JSON.stringify({{
                at: Date.now() - 29 * 60 * 1000,
                keys: [{first_key!r}]
            }}));
            const removeItem = Storage.prototype.removeItem;
            Storage.prototype.removeItem = function (name) {{
                if (name === key) throw new Error('Blocked deletion');
                return removeItem.call(this, name);
            }};
        }})()""")
        page = remembered.new_page()
        page.clock.install()
        page.goto(origin + EVENT, wait_until='networkidle')
        failed = page.get_by_role('button', name='First embed, Failed to load', exact=True)
        expect(failed).to_have_attribute('aria-pressed', 'false')
        expect(page.locator('iframe')).to_have_attribute('src', second_url)
        failed.click()
        expect(failed).to_have_count(0)
        expect(page.locator('iframe')).to_have_attribute('src', first_url)
        assert page.evaluate('key => JSON.parse(sessionStorage.getItem(key)).keys', storage_key) == [first_key]

        page.goto(origin + EVENT, wait_until='networkidle')
        expect(failed).to_be_visible()
        page.clock.fast_forward(60_000)
        expect(failed).to_have_count(0)
        expect(page.get_by_role('button', name='Second embed', exact=True)).to_have_attribute('aria-pressed', 'true')
    with browser.new_context(java_script_enabled=False) as no_js:
        no_js.route('**/*', intercept)
        page = no_js.new_page()
        page.goto(origin + EVENT, wait_until='networkidle')
        frame = page.locator('iframe')
        expect(frame).to_have_count(1)
        expect(frame).to_have_attribute('src', first_url)
        page.get_by_label('Change source').select_option(second_key)
        page.get_by_role('button', name='Change source').click()
        expect(frame).to_have_count(1)
        expect(frame).to_have_attribute('src', second_url)
    print('Source failure persists across reload and revisit, clears on retry or explicit selection, and stays in its session')


def check_stalled_feed(browser, directory, output):
    missing_uri = 'task34-missing-event'
    release = Event()
    requests = []

    class StalledFeed(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            if self.path == f'/primary/streams/{missing_uri}':
                self.send_error(404)
                return
            release.wait()

    log_path = directory / 'stalled-feed.log'
    with ThreadingHTTPServer(('127.0.0.1', 0), StalledFeed) as provider:
        thread = Thread(target=provider.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{provider.server_port}'
        try:
            with worker(directory, 'stalled-feed', output, 'https://advertiser.example', False,
                        variables=lambda _: {
                            'NUXT_PUBLIC_FEED_BASE': base + '/primary',
                            'NUXT_PUBLIC_FEED_MIRROR_BASE': base + '/mirror',
                        }, log_path=log_path) as origin, browser.new_context() as context:
                context.route('**/*', lambda route: route.continue_()
                              if route.request.url.startswith(origin + '/') else route.abort())
                page = context.new_page()
                for path, marker in {
                    '/': '"fromCache"',
                    '/live/247-cows': '24/7 COWS',
                    '/vods': 'Event Archive',
                    '/sitemap.xml': 'https://kwip.fyi/live/247-cows',
                }.items():
                    start = monotonic()
                    response = page.goto(origin + path, wait_until='domcontentloaded', timeout=9000)
                    elapsed = monotonic() - start
                    assert response.status == 200, (path, response.status)
                    assert marker in response.text(), path
                    if path == '/':
                        expect(page.get_by_role('status').filter(
                            has_text='Directory data is older than 5 minutes.',
                        )).to_be_visible()
                    print(f'Stalled upstream {path} -> HTTP 200 in {elapsed:.2f}s')
                missing = page.goto(origin + f'/live/{missing_uri}', wait_until='domcontentloaded', timeout=9000)
                assert f'/primary/streams/{missing_uri}' in requests
                assert missing.status == 404, missing.status
                assert 'snapshotUnavailable' not in missing.text()
                print('Missing event with no R2 binding -> HTTP 404')
                assert {'/primary/streams', '/mirror/streams'} <= set(requests), requests
                timeouts = [
                    json.loads(match) for match in re.findall(
                        r'\{"event":"feed_timeout"[^{}]+\}', log_path.read_text(),
                    )
                ]
                assert {(entry['endpoint'], entry['stage']) for entry in timeouts} >= {
                    (kind, stage) for kind in ('streams', 'stream', 'vods') for stage in ('primary', 'mirror')
                }, log_path.read_text()
                print('Worker timeout log:', json.dumps(timeouts[0]))
        finally:
            release.set()
            provider.shutdown()
            thread.join()


def check_snapshot_generation(browser, directory, output):
    wrapped = directory / 'snapshot-worker'
    shutil.copytree(output, wrapped)
    entry = wrapped / 'server/index.mjs'
    entry.rename(entry.with_name('original.mjs'))
    entry.write_text("""
import worker from './original.mjs'
export default {
  fetch(request, env, ctx) {
    const snapshots = {
      async get(key, options) {
        const path = options
          ? (env.TEST_READABLE === '1'
            ? `/r2/range/${options.range.offset}/${options.range.length}`
            : '/r2/range')
          : '/r2/manifest'
        const response = await fetch(env.TEST_PROVIDER + path)
        return { size: Number(response.headers.get('x-object-size')), etag: key,
          body: response.body, arrayBuffer: () => response.arrayBuffer() }
      },
    }
    return worker.fetch(request, { ...env, FEED_SNAPSHOTS: snapshots }, ctx)
  },
}
""")

    commit = '20261119T000000Z-01234567'
    date = '2026-11-19T00:00:00.000Z'
    packed = b''
    endpoints = []
    for path in ('streams', 'vods'):
        payload = (output / f'public/feed-cache/{path}.json').read_bytes()
        endpoints.append(dict(path=path, offset=len(packed), length=len(payload)))
        packed += payload
    manifest = dict(schema=1, commitId=commit, payloadId=commit,
                    payloadKey=f'snapshots/{commit}.bin', publishedAt=date,
                    listsVerifiedAt=date, detailsVerifiedAt=date, size=len(packed),
                    endpoints=endpoints)
    source = json.loads((output / 'public/feed-cache/streams.json').read_text())
    cow = next(item for group in source['streams'] for item in group['streams']
               if item['uri_name'] == '247-cows')
    cow.update(uri_name='upstream-only', name='Upstream-only event', always_live=1)
    upstream = {'success': True, 'streams': [
        {'category': 'Test Events', 'id': 1, 'always_live': 1, 'streams': [cow]},
    ]}
    release = Event()
    requests = []

    class Provider(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            if self.path == '/r2/manifest':
                data = manifest
            elif self.path.startswith('/r2/range/'):
                offset, length = map(int, self.path.split('/')[-2:])
                data = packed[offset:offset + length]
            elif self.path == '/healthy/streams':
                data = upstream
            elif self.path == '/healthy/vods':
                data = {'success': True, 'vods': []}
            else:
                release.wait()
                return
            body = data if isinstance(data, bytes) else json.dumps(data).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('X-Object-Size', str(len(packed) if isinstance(data, bytes) else len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    with ThreadingHTTPServer(('127.0.0.1', 0), Provider) as provider:
        thread = Thread(target=provider.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{provider.server_port}'
        try:
            missing_paths = ('/live/nba/2026-11-20/nope', '/live/nope', '/vods/nope')
            with worker(directory, 'generation-readable', wrapped, 'https://advertiser.example',
                        False, variables=lambda _: {
                            'TEST_PROVIDER': base,
                            'TEST_READABLE': '1',
                            'NUXT_PUBLIC_FEED_BASE': f'{base}/stalled',
                            'NUXT_PUBLIC_FEED_MIRROR_BASE': f'{base}/mirror',
                        }) as origin, browser.new_context(java_script_enabled=False) as context:
                page = context.new_page()
                for path in missing_paths:
                    requests.clear()
                    response = page.goto(origin + path, wait_until='domcontentloaded')
                    assert response.status == 404, (path, response.status)
                    assert requests[0] == '/r2/manifest'
                    assert any(request.startswith('/r2/range/') for request in requests), requests
                    assert all(request.startswith('/r2/') for request in requests), requests
                print('Readable R2 with omitted live and replay details: HTTP 404')

            for primary, marker in [('healthy', 'upstream-only'), ('stalled', '247-cows')]:
                log = directory / f'generation-{primary}.log'
                with worker(directory, f'generation-{primary}', wrapped, 'https://advertiser.example',
                            False, variables=lambda _: {
                                'TEST_PROVIDER': base,
                                'NUXT_PUBLIC_FEED_BASE': f'{base}/{primary}',
                                'NUXT_PUBLIC_FEED_MIRROR_BASE': f'{base}/mirror',
                            }, log_path=log) as origin, browser.new_context(java_script_enabled=False) as context:
                    page = context.new_page()
                    for path in ('/', '/sitemap.xml'):
                        requests.clear()
                        start = monotonic()
                        response = page.goto(origin + path, wait_until='domcontentloaded', timeout=6500)
                        assert response.status == 200, (path, response.status)
                        content = response.text()
                        assert f'/live/{marker}' in content, (primary, path)
                        if path == '/':
                            assert ('"fromCache"' in content) == (primary == 'stalled')
                        assert requests[0] == '/r2/manifest'
                        assert requests.index('/r2/range') < requests.index(f'/{primary}/streams')
                        if primary == 'stalled':
                            assert requests.count('/r2/manifest') == 2, requests
                            assert requests.index('/mirror/streams') < requests.index('/r2/manifest', 1)
                        print(f'Stalled R2, {primary} upstream {path}: HTTP 200 in {monotonic() - start:.2f}s')
                    if primary == 'stalled':
                        for path in ('/live/nope', '/vods/nope', '/live/247-cows', '/vods/back-to-the-beginning'):
                            response = page.goto(origin + path, wait_until='domcontentloaded', timeout=6500)
                            assert response.status == 200, (path, response.status)
                            assert '"fromCache"' in response.text(), path
                        print('Stalled R2 and upstreams with missing and seeded details: HTTP 200')
                    assert '"stage":"snapshot"' in log.read_text()
            uri = EVENT.removeprefix('/live/')
            supplement_url = 'https://strmfree.st/embed/basketball/test-1080p'
            supplement_key = supplement_url.removeprefix('https://')
            first_url = 'https://player.example/primary'
            starts_at = int(time()) - 60
            detail = json.loads((output / 'public/fixtures/stream.json').read_text())['data']
            detail.update(uri_name=uri, starts_at=starts_at, ends_at=starts_at + 7200,
                          always_live=0, substreams=[], sources=[
                              dict(name='Primary', data=first_url, type='iframe', default=True),
                          ])
            upstream = {'success': True, 'streams': [
                {'category': 'Basketball', 'id': 1, 'streams': [dict(
                    id=detail['id'], name=detail['name'], uri_name=uri, starts_at=starts_at,
                    ends_at=detail['ends_at'], always_live=0,
                )]},
            ]}
            published = dict(detail, sources=[*detail['sources'], dict(
                name='Strmfree', data=supplement_url, default=False, type='iframe',
                sourceTag='FHD', origin='supplement', live=False,
            )])
            packed = b''
            endpoints = []
            health = {first_url.removeprefix('https://'): dict(
                embedOk=False, manifestOk=False, sequence='unknown',
                checkedAt=datetime.now(UTC).isoformat(), error='embed-503',
            )}
            for path, item in [('streams', upstream), (f'streams/{uri}', {'success': True, 'data': published}),
                               ('health.json', health)]:
                payload = json.dumps(item).encode()
                endpoints.append(dict(path=path, offset=len(packed), length=len(payload)))
                packed += payload
            manifest.update(size=len(packed), endpoints=endpoints)

            with worker(directory, 'generation-refresh', wrapped, 'https://advertiser.example',
                        False, variables=lambda _: {
                            'TEST_PROVIDER': base,
                            'TEST_READABLE': '1',
                            'NUXT_PUBLIC_FEED_BASE': f'{base}/healthy',
                            'NUXT_PUBLIC_FEED_MIRROR_BASE': f'{base}/mirror',
                        }) as origin:
                for mode in ('unchanged', 'duplicate', 'new-id', 'expiry'):
                    updated = dict(detail, name='Refreshed upstream event')
                    if mode == 'new-id':
                        updated['id'] += 1
                    if mode == 'duplicate':
                        updated['sources'] = [*detail['sources'], dict(
                            name='Upstream duplicate', data=supplement_url + '?duplicate=1',
                            default=False, type='iframe',
                        )]
                    browser_requests = []

                    def intercept(route):
                        url = route.request.url
                        if url == f'{base}/healthy/streams/{uri}':
                            browser_requests.append('detail')
                            route.fulfill(json={'success': True, 'data': updated},
                                          headers={'Access-Control-Allow-Origin': '*'})
                        elif url == f'{base}/healthy/streams':
                            route.fulfill(json=upstream, headers={'Access-Control-Allow-Origin': '*'})
                        elif url in (first_url, supplement_url):
                            route.fulfill(body='<h1>Playback fixture</h1>', content_type='text/html')
                        elif url.startswith(origin + '/'):
                            route.continue_()
                        elif url == 'https://strmfree.pk/api/v1/streams':
                            browser_requests.append('provider')
                            route.fulfill(json={'streams': []}, headers={'Access-Control-Allow-Origin': '*'})
                        else:
                            route.abort()

                    with browser.new_context(viewport={'width': 1280, 'height': 900}) as context:
                        context.route('**/*', intercept)
                        page = context.new_page()
                        if mode == 'expiry':
                            page.clock.install()
                        if mode == 'new-id':
                            page.add_init_script(f'''sessionStorage.setItem('supplement:v6:{uri}', JSON.stringify({{
                                status: 'merged', fetchedAt: Date.now(), eventId: '{detail["id"]}', sources: [{{
                                    data: '{supplement_url}', origin: 'supplement', name: '', substreamName: '',
                                    type: 'iframe', default: false,
                                }}],
                            }}))''')
                        response = page.goto(origin + EVENT + '?source=' + quote(supplement_key))
                        assert response.ok
                        expect(page.get_by_role('heading', name=updated['name'], exact=True)).to_be_visible()
                        picker = page.get_by_role('group', name='Playback source')
                        chip = picker.locator(f'button[value="{supplement_key}"]')
                        primary = picker.locator(f'button[value="{first_url.removeprefix("https://")}"]')
                        if mode != 'new-id':
                            expect(chip).to_have_count(1)
                            expect(chip).to_contain_text('Strmfree · FHD')
                            expect(chip).to_contain_text('Not live')
                            expect(chip).to_have_attribute('aria-pressed', 'true')
                            expect(page.locator('iframe')).to_have_attribute('src', supplement_url)
                            expect(primary).to_contain_text('Degraded')
                            assert browser_requests == ['detail'], browser_requests
                        if mode == 'expiry':
                            with page.expect_response('https://strmfree.pk/api/v1/streams'):
                                page.clock.fast_forward(10 * 60_000)
                        if mode in ('new-id', 'expiry'):
                            expect(chip).to_have_count(0)
                            expect(primary).not_to_contain_text('Degraded')
                            expect(page.locator('iframe')).to_have_attribute('src', first_url)
                            assert browser_requests.count('provider') == 1, browser_requests
                    print(f'Published supplement refresh and expiry check passed ({mode})')
        finally:
            release.set()
            provider.shutdown()
            thread.join()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp, sync_playwright() as pw:
        with worker(Path(temp), 'source-health', args.output.resolve(), 'https://advertiser.example', False, player='/fixtures') as origin:
            browser = pw.chromium.launch()
            check_source_health(browser, origin)
        check_stalled_feed(browser, Path(temp), args.output.resolve())
        check_snapshot_generation(browser, Path(temp), args.output.resolve())
        browser.close()


if __name__ == '__main__':
    main()
