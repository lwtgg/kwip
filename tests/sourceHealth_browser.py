"""Run from the repo root after pnpm build.

    python tests/sourceHealth_browser.py .output
"""
import argparse
from contextlib import ExitStack
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


def check_late_supplement_shield(browser, directory, output, width):
    former_url = 'https://strmfree.st/one'
    first_url = 'https://strmfree.st/moved'
    peer_url = 'https://strmfree.st/peer'
    supplement_url = 'https://strmfree.st/embed/hou-mia'
    other_url = 'https://strmfree.st/other-event'
    other_event = '/live/basketball/den-phx'

    def fixture(name, url, event):
        def configure(_):
            path = directory / f'{name}-assets/fixtures/stream.json'
            detail = json.loads(path.read_text())
            detail['data']['sources'][0].update(name='strmfree', data=url)
            detail['data']['sources'][1].update(name='strmfree', data=peer_url)
            if event != EVENT:
                detail['data']['uri_name'] = event.removeprefix('/live/')
                detail['data']['sources'][2].update(name='strmfree', data=supplement_url, type='iframe')
            path.write_text(json.dumps(detail))
            return {}
        return configure

    with ExitStack() as stack:
        def start(name, url, event=EVENT):
            return stack.enter_context(worker(
                directory, name, output, 'https://advertiser.example',
                False, player='/fixtures', variables=fixture(name, url, event),
            ))

        former_origin = start('former-shield', former_url)
        sandbox = 'allow-scripts allow-same-origin allow-presentation'
        with browser.new_context(viewport={'width': width, 'height': 900}) as former:
            former.route('https://strmfree.st/**', lambda route: route.fulfill(
                body='<h1>Playable fixture</h1>', content_type='text/html',
            ))
            former.route(former_origin + '/fixtures/strmfree.json',
                         lambda route: route.fulfill(json={'streams': []}))
            page = former.new_page()
            assert page.goto(former_origin + EVENT, wait_until='networkidle').ok
            shield = page.get_by_role('button', name='Shield', exact=True)
            expect(shield).to_have_attribute('aria-pressed', 'false')
            shield.click()
            expect(page.locator('iframe')).to_have_attribute('sandbox', sandbox)
            peer = page.locator('button[value="strmfree.st/peer"]')
            peer.click()
            expect(page.locator('iframe')).to_have_attribute('src', peer_url)
            expect(shield).to_have_attribute('aria-pressed', 'false')
            assert page.locator('iframe').get_attribute('sandbox') is None
            saved = former.storage_state()

        origin = start('late-shield', first_url)
        def restore(saved, from_origin, to_origin):
            # Each fixture Worker uses a separate port. Carry the same browser storage between them.
            for entry in saved['origins']:
                if entry['origin'] == from_origin:
                    entry['origin'] = to_origin
            return stack.enter_context(browser.new_context(viewport={'width': width, 'height': 900}, storage_state=saved))

        context = restore(saved, former_origin, origin)
        pending = []
        requests = []

        def intercept(route):
            url = route.request.url
            if url in (first_url, peer_url, supplement_url):
                requests.append(url)
                route.fulfill(body='<h1>Playable fixture</h1>', content_type='text/html')
            elif url == origin + '/fixtures/strmfree.json':
                pending.append(route)
            elif url.startswith(origin + '/'):
                route.continue_()
            else:
                route.abort()

        context.route('**/*', intercept)
        page = context.new_page()
        with page.expect_request(origin + '/fixtures/strmfree.json'):
            assert page.goto(origin + EVENT, wait_until='domcontentloaded').ok
        frame = page.locator('iframe')
        shield = page.get_by_role('button', name='Shield', exact=True)
        expect(shield).to_have_attribute('aria-pressed', 'true')
        expect(frame).to_have_attribute('sandbox', sandbox)
        original_frame = frame.element_handle()
        expect(page.frame_locator('iframe').get_by_text('Playable fixture')).to_be_visible()

        assert len(pending) == 1
        pending.pop().fulfill(json={'streams': [{
            'name': 'Miami Heat at Houston Rockets', 'category': 'basketball',
            'stream_key': 'hou-mia', 'match_timestamp': int(time()) - 60,
            'iframe': supplement_url,
        }]})
        picker = page.get_by_role('group', name='Playback source')
        supplement = picker.get_by_role('button', name=re.compile(r'^strmfree · [0-9]+, second provider$'))
        expect(supplement).to_be_visible()
        expect(shield).to_have_attribute('aria-pressed', 'true')
        expect(frame).to_have_attribute('sandbox', sandbox)
        assert original_frame.evaluate('element => element.isConnected')
        assert requests == [first_url], requests

        picker.locator('button[value="strmfree.st/peer"]').click()
        expect(frame).to_have_attribute('src', peer_url)
        expect(shield).to_have_attribute('aria-pressed', 'false')
        assert frame.get_attribute('sandbox') is None

        supplement.click()
        expect(frame).to_have_attribute('src', supplement_url)
        expect(shield).to_have_attribute('aria-pressed', 'false')
        picker.get_by_role('button', name='strmfree', exact=True).click()
        expect(frame).to_have_attribute('src', first_url)
        expect(frame).to_have_attribute('sandbox', sandbox)
        print('Same-name, same-host sources stay isolated through a path change and late supplement')


        other_origin = start('other-shield', other_url, other_event)
        other = restore(context.storage_state(), origin, other_origin)
        other.route('https://strmfree.st/**', lambda route: route.fulfill(
            body='<h1>Playable fixture</h1>', content_type='text/html',
        ))
        other.route(other_origin + '/fixtures/strmfree.json', lambda route: route.fulfill(json={'streams': []}))
        other_page = other.new_page()
        assert other_page.goto(other_origin + other_event, wait_until='networkidle').ok
        other_frame = other_page.locator('iframe')
        other_shield = other_page.get_by_role('button', name='Shield', exact=True)
        expect(other_frame).to_have_attribute('src', other_url)
        expect(other_shield).to_have_attribute('aria-pressed', 'false')
        assert other_frame.get_attribute('sandbox') is None
        storage_key = 'kwip:shielded-sources'
        saved_preference = "key => localStorage.getItem(key)"
        assert other_page.evaluate(saved_preference, storage_key) == page.evaluate(saved_preference, storage_key)

        # Save a different setting on the other event before returning to the first.
        other_page.locator('button[value="strmfree.st/peer"]').click()
        expect(other_frame).to_have_attribute('src', peer_url)
        other_shield.click()
        expect(other_frame).to_have_attribute('sandbox', sandbox)
        returned = restore(other.storage_state(), other_origin, origin)
        returned.route('https://strmfree.st/**', lambda route: route.fulfill(
            body='<h1>Playable fixture</h1>', content_type='text/html',
        ))
        returned.route(origin + '/fixtures/strmfree.json', lambda route: route.fulfill(json={'streams': []}))
        returned_page = returned.new_page()
        assert returned_page.goto(origin + EVENT, wait_until='networkidle').ok
        returned_frame = returned_page.locator('iframe')
        returned_shield = returned_page.get_by_role('button', name='Shield', exact=True)
        expect(returned_frame).to_have_attribute('src', first_url)
        expect(returned_frame).to_have_attribute('sandbox', sandbox)
        returned_page.locator('button[value="strmfree.st/peer"]').click()
        expect(returned_frame).to_have_attribute('src', peer_url)
        expect(returned_shield).to_have_attribute('aria-pressed', 'false')
        assert returned_frame.get_attribute('sandbox') is None
        print('Other event starts fresh and returning restores the original Shield settings')


def check_source_health(browser, origin, width):
    with browser.new_context(viewport={'width': width, 'height': 900}) as context:
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
        selected = chips.get_by_role('group', name='Selected source', exact=True).get_by_role('button')
        expect(selected).to_have_count(1)
        expect(selected).to_have_attribute('value', second_key)
        alternatives = chips.get_by_role('group', name='Change source', exact=True).get_by_role('button')
        assert alternatives.evaluate_all('buttons => buttons.map(button => button.value)') == [
            key for key in original_order if key != second_key
        ]
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

    with browser.new_context(viewport={'width': width, 'height': 900}) as fresh:
        fresh.route('**/*', intercept)
        page = fresh.new_page()
        page.goto(origin + EVENT, wait_until='networkidle')
        expect(page.get_by_role('button', name='First embed', exact=True)).to_have_attribute('aria-pressed', 'true')
        expect(page.get_by_text(' · Failed')).to_have_count(0)
        page.goto(origin + EVENT + '?source=' + quote(second_key), wait_until='networkidle')
        picker = page.get_by_role('group', name='Playback source', exact=True)
        edge = picker.get_by_role('group', name='Selected source', exact=True)
        first = picker.get_by_role('button', name='First embed', exact=True)
        second = picker.get_by_role('button', name='Second embed', exact=True)
        external = picker.get_by_role('button', name='External fixture', exact=True)
        second.focus()
        page.keyboard.press('ArrowRight')
        expect(first).to_be_focused()
        page.keyboard.press('ArrowRight')
        expect(external).to_be_focused()
        expect(edge.get_by_role('button')).to_have_attribute('value', second_key)
        page.keyboard.press('ArrowLeft')
        expect(first).to_be_focused()
        page.keyboard.press('Enter')
        expect(edge.get_by_role('button', name='First embed', exact=True)).to_be_focused()
        expect(page.locator('iframe')).to_have_attribute('src', first_url)
        page.keyboard.press('ArrowRight')
        expect(second).to_be_focused()
    with browser.new_context(viewport={'width': width, 'height': 900}) as remembered:
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
    with browser.new_context(viewport={'width': width, 'height': 900}, java_script_enabled=False) as no_js:
        no_js.route('**/*', intercept)
        page = no_js.new_page()
        page.goto(origin + EVENT, wait_until='networkidle')
        frame = page.locator('iframe')
        expect(frame).to_have_count(1)
        expect(frame).to_have_attribute('src', first_url)
        picker = page.get_by_role('combobox', name='Change source', exact=True)
        expect(picker.get_by_role('option', name='First embed', exact=True)).to_have_count(0)
        picker.select_option(second_key)
        page.get_by_role('button', name='Change source').click()
        expect(frame).to_have_count(1)
        expect(frame).to_have_attribute('src', second_url)
        selected_url = page.url
        expect(picker).to_have_value('')
        page.get_by_role('button', name='Change source').click()
        expect(page).to_have_url(selected_url)
        expect(frame).to_have_attribute('src', second_url)
        assert picker.evaluate('select => select.validity.valueMissing')
    print('Source failure persists across reload and revisit, clears on retry or explicit selection, and stays in its session')


def check_stalled_feed(browser, directory, output, width):
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
                        }, log_path=log_path) as origin, browser.new_context(viewport={'width': width, 'height': 900}) as context:
                context.route('**/*', lambda route: route.continue_()
                              if route.request.url.startswith(origin + '/') else route.abort())
                page = context.new_page()
                for path, marker in {
                    '/': '"fromCache"',
                    '/live/247-cows': '24/7 COWS',
                    '/vods': 'Event archive',
                    '/sitemap.xml': 'https://kwip.fyi/live/247-cows',
                }.items():
                    start = monotonic()
                    response = page.goto(origin + path, wait_until='domcontentloaded', timeout=9000)
                    elapsed = monotonic() - start
                    assert response.status == 200, (path, response.status)
                    assert marker in response.text(), path
                    if path == '/':
                        expect(page.get_by_role('status').filter(
                            has_text='The last update was more than 20 minutes ago.',
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


def check_snapshot_generation(browser, directory, output, width):
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
        return { size: Number(response.headers.get('x-object-size')), etag: response.headers.get('etag') ?? key,
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
            if self.path == '/r2/manifest':
                self.send_header('ETag', manifest['commitId'])
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
                        }) as origin, browser.new_context(viewport={'width': width, 'height': 900}, java_script_enabled=False) as context:
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
                            }, log_path=log) as origin, browser.new_context(viewport={'width': width, 'height': 900}, java_script_enabled=False) as context:
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
            original_manifest, original_packed = manifest, packed
            refreshed_commit = '20261119T001500Z-01234567'
            refreshed_packed = b''
            refreshed_endpoints = []
            for path, item in [('streams', upstream), (f'streams/{uri}', {'success': True, 'data': detail})]:
                payload = json.dumps(item).encode()
                refreshed_endpoints.append(dict(path=path, offset=len(refreshed_packed), length=len(payload)))
                refreshed_packed += payload
            refreshed_manifest = dict(
                manifest, commitId=refreshed_commit, payloadId=refreshed_commit,
                payloadKey=f'snapshots/{refreshed_commit}.bin', endpoints=refreshed_endpoints, size=len(refreshed_packed),
            )

            pitsport_url = 'https://pitsport.st/programs/103172/play'
            pitsport_key = pitsport_url.removeprefix('https://')
            pitsport_detail = dict(detail, sources=[*detail['sources'], dict(
                name='PitSport', data=pitsport_url, default=False, type='iframe', sourceTag='HD', origin='pitsport',
            )])
            pitsport_packed = b''
            pitsport_endpoints = []
            for path, item in [('streams', upstream), (f'streams/{uri}', {'success': True, 'data': pitsport_detail}),
                               ('health.json', health)]:
                payload = json.dumps(item).encode()
                pitsport_endpoints.append(dict(path=path, offset=len(pitsport_packed), length=len(payload)))
                pitsport_packed += payload
            pitsport_commit = '20261119T003000Z-01234567'
            pitsport_manifest = dict(
                original_manifest, commitId=pitsport_commit, payloadId=pitsport_commit,
                payloadKey=f'snapshots/{pitsport_commit}.bin', size=len(pitsport_packed), endpoints=pitsport_endpoints,
            )

            with worker(directory, 'generation-refresh', wrapped, 'https://advertiser.example',
                        False, variables=lambda _: {
                            'TEST_PROVIDER': base,
                            'TEST_READABLE': '1',
                            'NUXT_PUBLIC_FEED_BASE': f'{base}/healthy',
                            'NUXT_PUBLIC_FEED_MIRROR_BASE': f'{base}/mirror',
                        }) as origin:
                for mode in ('unchanged', 'duplicate', 'new-id', 'new-generation', 'expiry', 'active-snapshot', 'pitsport-only'):
                    manifest, packed = ((pitsport_manifest, pitsport_packed) if mode == 'pitsport-only'
                                        else (original_manifest, original_packed))
                    expected_commit = refreshed_commit if mode == 'new-generation' else manifest['commitId']
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
                        nonlocal manifest, packed
                        url = route.request.url
                        if url == f'{base}/healthy/streams/{uri}':
                            browser_requests.append('detail')
                            if mode == 'active-snapshot':
                                route.abort()
                                return
                            if mode == 'new-generation':
                                manifest, packed = refreshed_manifest, refreshed_packed
                            route.fulfill(json={'success': True, 'data': updated},
                                          headers={'Access-Control-Allow-Origin': '*'})
                        elif url == f'{base}/healthy/streams':
                            route.fulfill(json=upstream, headers={'Access-Control-Allow-Origin': '*'})
                        elif url in (first_url, supplement_url, pitsport_url):
                            route.fulfill(body='<h1>Playback fixture</h1>', content_type='text/html')
                        elif url == origin + '/api/source-health?current=1':
                            browser_requests.append('generation')
                            route.continue_()
                        elif url.startswith(origin + '/'):
                            route.continue_()
                        elif url == 'https://strmfree.pk/api/v1/streams':
                            browser_requests.append('provider')
                            route.fulfill(json={'streams': []}, headers={'Access-Control-Allow-Origin': '*'})
                        else:
                            route.abort()

                    with browser.new_context(viewport={'width': width, 'height': 900}) as context:
                        context.route('**/*', intercept)
                        page = context.new_page()
                        if mode in ('expiry', 'active-snapshot'):
                            page.clock.install()
                        if mode == 'new-id':
                            page.add_init_script(f'''sessionStorage.setItem('supplement:v6:{uri}', JSON.stringify({{
                                status: 'merged', fetchedAt: Date.now(), eventId: '{detail["id"]}', sources: [{{
                                    data: '{supplement_url}', origin: 'supplement', name: '', substreamName: '',
                                    type: 'iframe', default: false,
                                }}],
                            }}))''')
                        key = pitsport_key if mode == 'pitsport-only' else supplement_key
                        url = origin + EVENT + '?source=' + quote(key)
                        generation_url = origin + '/api/source-health?current=1'
                        checks_generation = mode not in ('new-id', 'active-snapshot')
                        if checks_generation:
                            with page.expect_response(generation_url) as generation_check:
                                response = page.goto(url)
                            checked = generation_check.value
                            assert checked.headers['cache-control'] == 'no-store'
                            assert checked.json() == {'commitId': expected_commit}
                        else:
                            response = page.goto(url, wait_until='domcontentloaded')
                        assert response.ok
                        picker = page.get_by_role('group', name='Playback source')
                        chip = picker.locator(f'button[value="{key}"]')
                        primary = picker.locator(f'button[value="{first_url.removeprefix("https://")}"]')
                        if mode == 'active-snapshot':
                            expect(chip).to_have_attribute('aria-pressed', 'true')
                            playback = page.frame_locator('iframe').get_by_role('heading', name='Playback fixture')
                            expect(playback).to_be_visible()
                            # Routed cross-origin frames do not always expose resource timing to the parent.
                            playback.evaluate("() => parent.postMessage('fixture ready', '*')")
                            expect(page.get_by_text('Loading player embed…', exact=True)).to_have_count(0)
                            page.clock.fast_forward(10 * 60_000)
                            expect(chip).to_have_attribute('aria-pressed', 'true')
                            expect(page.locator('iframe')).to_have_attribute('src', supplement_url)
                            expect(primary).to_contain_text('Degraded')
                            assert browser_requests == ['detail'], browser_requests
                            expect(page.get_by_role('heading', name=detail['name'], exact=True)).to_be_visible()
                            print('Active snapshot keeps its supplements after ten minutes')
                            continue
                        expect(page.get_by_role('heading', name=updated['name'], exact=True)).to_be_visible()
                        if mode == 'pitsport-only':
                            expect(chip).to_have_accessible_name('PitSport · HD, second provider')
                            expect(chip).to_have_attribute('aria-pressed', 'true')
                            expect(page.locator('iframe')).to_have_attribute('src', pitsport_url)
                            assert sorted(browser_requests) == ['detail', 'generation', 'provider'], browser_requests
                            print('PitSport-only carry-over preserves selection and the Strmfree fallback')
                            continue
                        if mode not in ('new-id', 'new-generation'):
                            expect(chip).to_have_count(1)
                            expect(chip).to_contain_text('Strmfree · FHD')
                            expect(chip).to_contain_text('Not live')
                            expect(chip).to_have_attribute('aria-pressed', 'true')
                            expect(page.locator('iframe')).to_have_attribute('src', supplement_url)
                            expect(primary).to_contain_text('Degraded')
                            assert browser_requests == ['detail', 'generation'], browser_requests
                        if mode == 'unchanged':
                            selected = page.get_by_role('group', name='Selected source', exact=True)
                            expect(selected).to_contain_text('Strmfree · FHD')
                            expect(primary).to_have_css('background-color', 'rgb(27, 32, 30)')
                            primary.click()
                            page.mouse.move(0, 0)
                            expect(primary).to_contain_text('Degraded')
                            expect(primary).to_have_attribute('aria-pressed', 'true')
                            expect(selected).to_contain_text(primary.inner_text().split(' · Degraded')[0].strip())
                            expect(primary).to_have_css('background-color', 'rgb(44, 52, 48)')
                        if mode == 'expiry':
                            with page.expect_response('https://strmfree.pk/api/v1/streams'):
                                page.clock.fast_forward(10 * 60_000)
                        if mode in ('new-id', 'new-generation', 'expiry'):
                            expect(chip).to_have_count(0)
                            expect(primary).not_to_contain_text('Degraded')
                            expect(page.locator('iframe')).to_have_attribute('src', first_url)
                            assert browser_requests.count('provider') == 1, browser_requests
                            assert browser_requests.count('generation') == (0 if mode == 'new-id' else 1), browser_requests
                    print(f'Published supplement refresh and expiry check passed ({mode})')
        finally:
            release.set()
            provider.shutdown()
            thread.join()


def check_zlive_picker(browser, directory, output, width):
    sources = [
        dict(name='Primary', type='iframe', default=True, data='https://player.example/primary'),
        dict(name='Primary backup', type='iframe', default=False, data='https://player.example/backup'),
        dict(name='Strmfree', type='iframe', default=False, data='https://strmfree.st/embed/fixture', origin='supplement'),
        dict(name='PitSport', type='iframe', default=False, data='https://pitsport.st/programs/1/play', origin='pitsport'),
        dict(name='zlive', type='iframe', default=False, data='https://zlive.st/embed/fixture', origin='zlive'),
        dict(name='zlive backup', type='iframe', default=False, data='https://zlive.st/embed/fixture-backup', origin='zlive'),
    ]
    for alternate_providers, ordinal, spoken in (
        ([], '2nd', 'second'), (['pitsport'], '3rd', 'third'), (['supplement', 'pitsport'], '4th', 'fourth'),
    ):
        name = f'zlive-{ordinal}'

        def configure(_):
            path = directory / f'{name}-assets/fixtures/stream.json'
            fixture = json.loads(path.read_text())
            fixture['data'].update(always_live=1, substreams=[], sources=[
                source for source in sources if source.get('origin') in (None, 'zlive', *alternate_providers)
            ])
            path.write_text(json.dumps(fixture))
            return {}

        with worker(directory, name, output, 'https://advertiser.example', False, variables=configure) as origin:
            with browser.new_context(viewport={'width': width, 'height': 900}) as context:
                requests = []

                def serve_zlive(route):
                    requests.append(route.request.url)
                    route.fulfill(body='<h1>zlive fixture</h1>', content_type='text/html')

                context.route('https://player.example/**', lambda route: route.fulfill(
                    body='<h1>Primary fixture</h1>', content_type='text/html',
                ))
                context.route('https://zlive.st/**', serve_zlive)
                page = context.new_page()
                page.clock.install()
                assert page.goto(origin + EVENT, wait_until='domcontentloaded').ok
                primary = page.get_by_role('button', name='Primary', exact=True)
                expect(primary).to_have_attribute('aria-pressed', 'true')
                chip = page.get_by_role('button', name=f'zlive, {spoken} provider', exact=True)
                backup = page.get_by_role('button', name=f'zlive backup, {spoken} provider', exact=True)
                expect(chip.get_by_text(ordinal, exact=True)).to_be_visible()
                expect(backup.get_by_text(ordinal, exact=True)).to_be_visible()

                page.add_style_tag(content="main::before { content: ''; display: block; height: 3000px; }")
                chip.evaluate('(button) => button.click()')
                expect(chip).to_have_attribute('aria-pressed', 'true')
                page.clock.fast_forward(20_000)
                expect(page.locator('iframe')).to_have_count(0)
                expect(chip).to_have_attribute('aria-pressed', 'true')
                assert not requests, requests

                page.get_by_text('Loading player embed…', exact=True).scroll_into_view_if_needed()
                expect(page.locator('iframe')).to_have_attribute('loading', 'lazy')
                expect(page.frame_locator('iframe').get_by_role('heading', name='zlive fixture')).to_be_visible()
                assert requests == [sources[4]['data']], requests
        print(f'{width}px zlive uses {ordinal} and waits for the viewport before requesting the embed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp, sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width in (390, 1280):
            print(f'Source health at {width}px', flush=True)
            with tempfile.TemporaryDirectory(dir=temp) as run:
                directory = Path(run)
                with worker(directory, 'source-health', args.output.resolve(), 'https://advertiser.example', False, player='/fixtures') as origin:
                    check_source_health(browser, origin, width)
                check_late_supplement_shield(browser, directory, args.output.resolve(), width)
                check_stalled_feed(browser, directory, args.output.resolve(), width)
                check_snapshot_generation(browser, directory, args.output.resolve(), width)
                check_zlive_picker(browser, directory, args.output.resolve(), width)
        browser.close()


if __name__ == '__main__':
    main()
