"""Run from the repo root after building the pre-task baseline (1942ccb)
and the current revision with pnpm build.

In a Python environment with Playwright and Chromium installed, run:
    python tests/click_under_browser.py /path/to/pre-task-30/.output .output
"""
import argparse
from contextlib import ExitStack, contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
from threading import Thread
import time
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

EVENT = '/live/basketball/hou-mia'
PLAYER = 'https://player.example.test'
CLS_OBSERVER = """window.layoutShifts = [];
new PerformanceObserver(list => layoutShifts.push(...list.getEntries()
  .filter(entry => !entry.hadRecentInput).map(entry => [entry.startTime, entry.value])))
  .observe({type: 'layout-shift', buffered: true});"""
CLS_SCORE = """() => {
  let max = 0, score = 0, first = -Infinity, last = -Infinity;
  for (const [time, value] of layoutShifts) {
    if (time - first >= 5000 || time - last >= 1000) {
      first = time; score = 0;
    }
    last = time; score += value; max = Math.max(max, score);
  }
  return max;
}"""


def fixture_assets(output, directory, player=PLAYER):
    shutil.copytree(output / 'public', directory)
    fixtures = directory / 'fixtures'
    now = int(time.time())
    path = fixtures / 'stream.json'
    detail = json.loads(path.read_text())
    detail['data'].update(starts_at=now - 60, ends_at=now + 7200, sources=[
        dict(name='First embed', type='iframe', default=True, data=f'{player}/one'),
        dict(name='Second embed', type='iframe', default=False, data=f'{player}/two'),
        dict(name='External fixture', type='link', default=False, data=f'{player}/external'),
    ])
    path.write_text(json.dumps(detail))
    path = fixtures / 'streams.json'
    listing = json.loads(path.read_text())
    listing['timestamp'] = now
    for category in listing['streams']:
        for event in category['streams']:
            event.pop('poster', None)
    path.write_text(json.dumps(listing))


@contextmanager
def worker(directory, name, output, destination, enabled, *, variables=None, player=PLAYER, banner_fixture=None):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    assets = directory / f'{name}-assets'
    origin = f'http://127.0.0.1:{port}'
    fixture_assets(output, assets, origin + player if player.startswith('/') else player)
    overrides = variables(origin) if variables else {}
    config = directory / f'{name}.toml'
    config_text = f'''name = "kwip-click-under-{name}"
main = {json.dumps(str(output / 'server/index.mjs'))}
compatibility_date = "2025-07-15"
compatibility_flags = ["nodejs_compat"]
[assets]
binding = "ASSETS"
directory = {json.dumps(str(assets))}
not_found_handling = "none"
[vars]
NUXT_PUBLIC_FEED_BASE = "/fixtures"
NUXT_PUBLIC_ADS = "{str(enabled).lower()}"
NUXT_AD_DESTINATION = "{destination}"
''' + ''.join(f'{key} = {json.dumps(value)}\n' for key, value in overrides.items())
    persist = []
    if banner_fixture:
        config_text += '\n[[r2_buckets]]\nbinding = "BANNER_ASSETS"\nbucket_name = "kwip-test-banners"\n'
        persist = ['--persist-to', str(directory / f'{name}-r2')]
    config.write_text(config_text)
    if banner_fixture:
        subprocess.run(
            ['pnpm', 'exec', 'wrangler', 'r2', 'object', 'put', 'kwip-test-banners/house.jpg',
             '--local', '--config', str(config), '--file', str(banner_fixture), *persist],
            check=True, capture_output=True,
        )
    with tempfile.TemporaryFile() as logs, subprocess.Popen(
        ['pnpm', 'exec', 'wrangler', 'dev', '--config', str(config),
         '--ip', '127.0.0.1', '--port', str(port), '--inspector-port', '0', *persist],
        stdout=logs, stderr=subprocess.STDOUT,
    ) as process:
        try:
            deadline = time.monotonic() + 30
            while process.poll() is None and time.monotonic() < deadline:
                try:
                    with urlopen(origin + '/fixtures/stream.json', timeout=1):
                        break
                except (URLError, TimeoutError):
                    time.sleep(0.2)
            else:
                logs.seek(0)
                raise RuntimeError(logs.read().decode(errors='replace'))
            yield origin
        finally:
            if process.poll() is None:
                process.terminate()


@contextmanager
def event_page(browser, origin, width, *, block_redirect=False, block_first_open=False):
    context = browser.new_context(viewport={'width': width, 'height': 850})
    try:
        context.add_init_script(CLS_OBSERVER)
        if block_first_open:
            context.add_init_script("""const open = window.open.bind(window);
            let attempt = 0;
            window.open = (...args) => ++attempt === 1 ? null : open(...args);""")
        context.route(f'{PLAYER}/**', lambda route: route.fulfill(
            body='<h1>Playable fixture</h1>', content_type='text/html',
        ))
        if block_redirect:
            context.route(f'{origin}/go/**', lambda route: route.abort('blockedbyclient'))
        page = context.new_page()
        third_party = []
        page.on('request', lambda req: third_party.append(req.url)
                if not req.url.startswith(origin + '/') else None)
        assert page.goto(origin + EVENT, wait_until='networkidle').ok
        expect(chip(page, 'First embed')).to_be_visible()
        expect_player(page, 'one')
        yield context, page, third_party
    finally:
        context.close()


def chip(page, name):
    return page.get_by_role('button', name=name)


def expect_player(page, source):
    expect(page.locator('iframe')).to_have_attribute('src', f'{PLAYER}/{source}')
    expect(page.frame_locator('iframe').get_by_text('Playable fixture')).to_be_visible()


def metrics(page, requests):
    page.wait_for_load_state('networkidle')
    return f'CLS={page.evaluate(CLS_SCORE):.7f}, third-party requests={len(requests)}'


def check_source(browser, origin, width, label, ads):
    with event_page(browser, origin, width) as (context, page, requests):
        opened = []
        context.on('page', lambda tab: opened.append(tab))
        initial = metrics(page, requests)
        chip(page, 'First embed').click()
        assert not opened
        if ads:
            expect(chip(page, 'Second embed')).to_have_accessible_name(
                'Second embed. Opens an advertiser in a new tab')
            with context.expect_event('request', predicate=lambda req: req.url.endswith('/campaign.html')) as advertiser:
                with context.expect_page() as popup:
                    chip(page, 'Second embed').click()
            tab = popup.value
            expect(tab.get_by_text('Ad fixture')).to_be_visible()
            destination = advertiser.value
            redirect = destination.redirected_from
            assert redirect is not None and redirect.url == origin + '/go/source'
            assert 'referer' not in redirect.all_headers()
            assert 'referer' not in destination.all_headers()
            assert tab.evaluate('window.opener === null && document.referrer === ""')
            assert len(opened) == 1
        else:
            chip(page, 'Second embed').click()
        expect_player(page, 'two')
        chip(page, 'First embed').click()
        expect_player(page, 'one')
        after = metrics(page, requests)
        assert len(opened) == int(ads)
        if ads:
            expect(chip(page, 'Second embed')).to_have_accessible_name('Second embed')
            page.reload(wait_until='networkidle')
            chip(page, 'Second embed').click()
            expect_player(page, 'two')
            page.wait_for_load_state('networkidle')
            assert len(opened) == 1
        print(f'{width}px {label}: load [{initial}], two source changes [{after}]')


def check_blocking(browser, origin, width):
    with event_page(browser, origin, width, block_redirect=True) as (context, page, _):
        with context.expect_event('requestfailed', predicate=lambda req: '/go/source' in req.url):
            with context.expect_page():
                chip(page, 'Second embed').click()
        expect_player(page, 'two')
        chip(page, 'First embed').click()
        expect_player(page, 'one')
        page.wait_for_load_state('networkidle')
        assert len(context.pages) == 2

    with event_page(browser, origin, width, block_first_open=True) as (context, page, _):
        chip(page, 'Second embed').click()
        expect_player(page, 'two')
        assert len(context.pages) == 1
        expect(chip(page, 'First embed')).to_have_accessible_name(
            'First embed. Opens an advertiser in a new tab')
        with context.expect_page() as popup:
            chip(page, 'First embed').click()
        expect(popup.value.get_by_text('Ad fixture')).to_be_visible()
        expect_player(page, 'one')
        assert len(context.pages) == 2


def check_play(browser, origin, width):
    with event_page(browser, origin, width, block_redirect=True) as (context, page, _):
        chip(page, 'First embed').press('End')
        play = page.get_by_role('link', name='Open at source')
        expect(play).to_have_accessible_name(
            'Open at source · External fixture. Standard activation may open the source in this tab and an advertiser in a new tab')
        with context.expect_page() as modified:
            play.click(modifiers=['ControlOrMeta'])
        expect(modified.value.get_by_text('Playable fixture')).to_be_visible()
        assert modified.value.url == f'{PLAYER}/external'
        modified.value.close()
        with context.expect_event('requestfailed', predicate=lambda req: '/go/play' in req.url):
            with context.expect_page():
                play.click()
        expect(page.get_by_text('Playable fixture')).to_be_visible()
        assert page.url == f'{PLAYER}/external'
        assert len(context.pages) == 2

    with event_page(browser, origin, width, block_first_open=True) as (context, page, _):
        chip(page, 'First embed').press('End')
        with context.expect_page() as source:
            page.get_by_role('link', name='Open at source').click()
        expect(source.value.get_by_text('Playable fixture')).to_be_visible()
        assert source.value.url == f'{PLAYER}/external'
        assert page.url.startswith(origin + EVENT)
        assert len(context.pages) == 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('before', type=Path)
    parser.add_argument('after', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp, ExitStack() as stack, sync_playwright() as pw:
        directory = Path(temp)
        (directory / 'campaign.html').write_text('<h1>Ad fixture</h1>')
        server = stack.enter_context(ThreadingHTTPServer(
            ('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=directory)))
        Thread(target=server.serve_forever, daemon=True).start()
        stack.callback(server.shutdown)
        destination = f'http://127.0.0.1:{server.server_port}/campaign.html'
        before = stack.enter_context(worker(directory, 'before', args.before.resolve(), destination, False))
        after = args.after.resolve()
        off = stack.enter_context(worker(directory, 'off', after, destination, False))
        on = stack.enter_context(worker(directory, 'on', after, destination, True))
        browser = pw.chromium.launch()
        for width in (390, 1280):
            for origin, label, ads in [(before, 'baseline', False), (off, 'flag off', False), (on, 'flag on', True)]:
                check_source(browser, origin, width, label, ads)
            check_blocking(browser, on, width)
            check_play(browser, on, width)
            print(f'{width}px: blocked /go/*, blocked popup retry, and modified play passed')
        browser.close()


if __name__ == '__main__':
    main()
