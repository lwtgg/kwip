"""Run from the repo root after pnpm build.

    python tests/notLive_browser.py .output
"""
import argparse
import json
from pathlib import Path
import tempfile
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright

from click_under_browser import EVENT, worker

API = 'https://strmfree.pk/api/v1'
VARIANTS = (
    ('strmfree · HD', 'https://strmfree.pk/embed/hou-mia-720p'),
    ('streamfree · HD', 'https://streamfree.top/embed/hou-mia-alt-720p'),
)


def check_status(browser, origin, stream, width, case, live_flags):
    urls = [url for _, url in VARIANTS]
    status_url = f"{API}/sources/{stream['stream_key']}"
    first_url = origin + '/fixtures/one'
    failover = live_flags in ((True, False), (False, True))
    expected_live = live_flags if live_flags is not None else (None, None)
    status_requests = []
    frame_requests = []
    pending_primary = []
    errors = []

    def intercept(route):
        url = route.request.url
        if url == f'{API}/streams':
            route.fulfill(json={'streams': [stream]})
        elif url == status_url:
            status_requests.append(url)
            if live_flags is None:
                route.fulfill(status=404, json={})
            else:
                route.fulfill(json={'sources': [
                    {'url': variant, 'live': True}
                    for variant, live in zip(urls, live_flags, strict=True) if live
                ]})
        elif url in [first_url, *urls]:
            frame_requests.append(url)
            if url == first_url and failover:
                pending_primary.append(route)
            else:
                route.fulfill(body=f'<h1>{url}</h1>', content_type='text/html')
        elif url == origin + '/fixtures/poster-1.jpg':
            route.fulfill(status=302, headers={'location': origin + '/og-default.jpg'})
        elif url.startswith(origin + '/'):
            route.continue_()
        else:
            errors.append(f'Unexpected external request: {url}')
            route.abort()

    def record_console(message):
        if message.type != 'error':
            return
        # Chromium reports the intentionally mocked HTTP 404 independently of the app.
        if (live_flags is None and message.location['url'] == status_url
                and message.text == 'Failed to load resource: the server responded with a status of 404 (Not Found)'):
            return
        errors.append(message.text)

    with browser.new_context(viewport={'width': width, 'height': 850}) as context:
        context.route('**/*', intercept)
        page = context.new_page()
        page.on('console', record_console)
        page.on('pageerror', lambda error: errors.append(str(error)))
        response = page.goto(origin + EVENT, wait_until='domcontentloaded')
        assert response.status == 200

        picker = page.get_by_role('group', name='Playback source')
        first = picker.get_by_role('button', name='First embed', exact=True)
        frame = page.locator('iframe')
        expect(first).to_have_attribute('aria-pressed', 'true')
        expect(frame).to_have_attribute('src', first_url)
        expect(picker.get_by_role('button')).to_have_count(3)
        chips = []
        for (label, _), live in zip(VARIANTS, expected_live, strict=True):
            status = ', Not live' if live is False else ''
            chip = picker.get_by_role('button', name=f'{label}{status}, second provider', exact=True)
            expect(chip).to_be_visible()
            expect(chip).to_be_enabled()
            expect(chip).to_have_attribute('aria-pressed', 'false')
            expect(chip.get_by_text('· Not live', exact=True)).to_have_count(1 if live is False else 0)
            chips.append(chip)

        assert status_requests == [status_url], status_requests
        if failover:
            frame.dispatch_event('error')
            failed = picker.get_by_role('button', name='First embed, Failed to load', exact=True)
            expect(failed).to_have_attribute('aria-pressed', 'false')
            live_index = expected_live.index(True)
            live_url = urls[live_index]
            expect(chips[live_index]).to_have_attribute('aria-pressed', 'true')
            expect(chips[1 - live_index]).to_have_attribute('aria-pressed', 'false')
            expect(frame).to_have_attribute('src', live_url)
            expect(page.frame_locator('iframe').get_by_role('heading', name=live_url, exact=True)).to_be_visible()
            assert frame_requests == [first_url, live_url], frame_requests
            [primary_route] = pending_primary
            primary_route.fulfill(status=204)

        # In mixed cases, switch from the live variant to the not-live one first.
        first_pick = expected_live.index(False) if failover else 1
        for index in (first_pick, 1 - first_pick):
            chip, url = chips[index], urls[index]
            chip.click()
            page.mouse.move(0, 0)
            expect(chip).to_have_attribute('aria-pressed', 'true')
            expect(chips[1 - index]).to_have_attribute('aria-pressed', 'false')
            selected = page.get_by_role('group', name='Selected source', exact=True)
            expect(selected).to_contain_text(VARIANTS[index][0])
            expect(chip).to_have_css('background-color', 'rgb(35, 46, 42)')
            expect(chips[1 - index]).to_have_css('background-color', 'rgb(25, 33, 30)')
            expect(frame).to_have_attribute('src', url)
            expect(chip.get_by_text('· Not live', exact=True)).to_have_count(1 if expected_live[index] is False else 0)
            key = chip.get_attribute('value')
            page.wait_for_url(lambda location: parse_qs(urlsplit(location).query).get('source') == [key])
            expect(page.frame_locator('iframe').get_by_role('heading', name=url, exact=True)).to_be_visible()
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('alert')).to_have_count(0)
        assert not errors, errors
        context.unroute_all(behavior='wait')

    print(f'{width}px: {case} status, picker, and playback passed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp, sync_playwright() as pw:
        directory = Path(temp)
        name = 'not-live'

        def fixture_config(_origin):
            fixtures = directory / f'{name}-assets' / 'fixtures'
            path = fixtures / 'stream.json'
            detail = json.loads(path.read_text())
            detail['data']['sources'] = detail['data']['sources'][:1]
            path.write_text(json.dumps(detail))
            stream = json.loads((fixtures / 'strmfree.json').read_text())['streams'][0]
            stream.update(
                match_timestamp=detail['data']['starts_at'],
                iframe=VARIANTS[1][1],
                additional_sources=[{'url': VARIANTS[0][1]}],
            )
            provider_stream.update(stream)
            # The server strips trailing slashes. Two slashes bypass the client's
            # fixture-only provider shortcut, allowing the real status fetch path.
            return {'NUXT_PUBLIC_FEED_BASE': '/fixtures//'}

        provider_stream = {}
        with worker(directory, name, args.output.resolve(), 'https://advertiser.example',
                    False, player='/fixtures', variables=fixture_config) as origin:
            browser = pw.chromium.launch()
            for width in (390, 1280):
                for case, flags in (
                    ('mixed live first', (True, False)),
                    ('mixed offline first', (False, True)),
                    ('404', None),
                    ('all live', (True, True)),
                ):
                    check_status(browser, origin, provider_stream, width, case, flags)
            browser.close()


if __name__ == '__main__':
    main()
