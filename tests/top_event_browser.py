"""Run against the default build: python tests/top_event_browser.py .output."""
import argparse
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
from threading import Thread
import tempfile
import time
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

from cards_browser import assert_clean_banner, collect_render_errors, settle_fit
from click_under_browser import CLS_OBSERVER, CLS_SCORE, worker

ZLIVE = 'https://zlive.st/embed/TSN4?quality=high'
TAIFOOD = 'https://taifood-blog.asia/embed/247-fox-cricket'
SANDBOX = 'allow-scripts allow-same-origin allow-presentation'
PROVIDER_DOC = '<!doctype html><html><h1>Third-party fixture</h1></html>'
EVENT = 'basketball/top-event'


@contextmanager
def provider(listing):
    class Feed(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/streams':
                data = listing
            elif self.path.startswith('/streams/'):
                event = next((event for event in listing['streams'][0]['streams']
                              if self.path == f"/streams/{event['uri_name']}"), None)
                if event is None:
                    self.send_error(404)
                    return
                data = dict(success=True, data=dict(event, sources=[
                    dict(type='iframe', name='External fixture', default=True, data=TAIFOOD),
                ]))
            else:
                self.send_error(404)
                return
            payload = json.dumps(data).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_):
            pass

    with ThreadingHTTPServer(('127.0.0.1', 0), Feed) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://127.0.0.1:{server.server_port}'
        finally:
            server.shutdown()
            thread.join()


def fixtures(output, variant):
    listing = json.loads((output / 'public/fixtures/streams.json').read_text())
    template = listing['streams'][0]['streams'][0]
    now = int(time.time())
    match = dict(state='in', detail='延長👩🏽‍⚽🇹🇭',
                 away=dict(name='Colorado State Rams', abbreviation='CSU', color='#1e4d2b', logo=None, score=50),
                 home=dict(name='Arizona Wildcats', abbreviation='ARIZ', color='#cc0033', logo=None, score=97))
    top = dict(template, name='Featured fixture', uri_name=EVENT, id=8000, match=match, viewers='62',
               starts_at=now-60, ends_at=now+7200, iframe=TAIFOOD, always_live=0, poster='')
    popular = dict(top, name='Popular fixture', uri_name='basketball/popular', id=8001, viewers='1000')
    if variant == 'taifood':
        popular['viewers'] = '50'
    else:
        top['hero_embed'] = ZLIVE
    if variant == 'upcoming':
        top.update(starts_at=now+60, match=dict(match, state='pre', detail='Scheduled',
                   away=dict(match['away'], score=None), home=dict(match['home'], score=None)))
        popular['starts_at'] = now+120
    fillers = [dict(popular, uri_name=f'basketball/filler-{i}', id=9000+i, starts_at=now+3600)
               for i in range(18)]
    return dict(listing, timestamp=now, streams=[
        dict(listing['streams'][0], always_live=0, streams=[popular, top, *fillers])
    ]), top


def check(browser, oracle, origin, feed, listing, event, width, variant):
    with browser.new_context(viewport={'width': width, 'height': 850}, reduced_motion='reduce') as context:
        context.add_init_script(CLS_OBSERVER)
        context.add_init_script('''(() => {
          window.heroHidden = !location.search.includes('natural=1');
          Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => window.heroHidden ? 'hidden' : 'visible'});
          Object.defineProperty(navigator, 'connection', {value: new EventTarget()});
          navigator.connection.saveData = SAVE_DATA;
        })();'''.replace('SAVE_DATA', str(variant == 'save-data').lower()))
        feed_requests = []
        player_requests = []
        ad_requests = []

        def intercept(route):
            url = route.request.url
            parts = urlsplit(url)
            if url == feed + '/streams':
                feed_requests.append(url)
                route.fulfill(json=listing, headers={'Access-Control-Allow-Origin': '*'})
            elif parts.hostname in ('zlive.st', 'taifood-blog.asia'):
                player_requests.append(url)
                route.fulfill(body=PROVIDER_DOC, content_type='text/html')
            elif url.startswith((origin + '/', feed + '/')):
                if parts.path.startswith('/go/'):
                    ad_requests.append(parts.path)
                route.continue_()
            else:
                route.abort()

        context.route('**/*', intercept)
        page = context.new_page()
        errors = []
        collect_render_errors(page, errors)
        assert page.goto(origin, wait_until='networkidle').ok
        # Exercise the browser's provider path with the same payload as the SSR provider.
        page.evaluate('''async () => {
          const app = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt;
          await app.callHook('app:data:refresh');
        }''')
        assert feed_requests == [feed + '/streams'], feed_requests
        hero = page.get_by_role('region', name='Featured event')
        card = hero.locator('.hero-card')
        link = hero.get_by_role('link')
        box = hero.locator('.hero-player')
        frame = box.locator('iframe')
        button = hero.get_by_role('button')
        expect(link).to_have_attribute('href', f'/live/{EVENT}')
        assert box.evaluate('(box) => box.previousElementSibling.classList.contains("hero-plate")')
        assert not link.locator('iframe, button').count()
        expect(frame).to_have_count(0)
        page.evaluate('document.fonts.ready')
        settle_fit(page)
        before = box.bounding_box()
        plate_before = link.bounding_box()
        page.evaluate('window.heroHidden = false; document.dispatchEvent(new Event("visibilitychange"))')

        if variant == 'save-data':
            page.wait_for_timeout(100)
            expect(frame).to_have_count(0)
            assert not player_requests
            page.evaluate('navigator.connection.saveData = false; navigator.connection.dispatchEvent(new Event("change"))')

        expected = TAIFOOD if variant == 'taifood' else ZLIVE + '&muted=1'
        if variant == 'upcoming':
            expected += '&autoplay=0'
        expect(frame).to_have_attribute('src', expected, timeout=4000)
        expect(frame).to_have_attribute('sandbox', SANDBOX)
        expect(frame).to_have_attribute('allow', 'autoplay; fullscreen; picture-in-picture')
        expect(frame.content_frame.get_by_role('heading', name='Third-party fixture')).to_be_visible()
        assert player_requests[0] == expected
        assert box.bounding_box() == before
        assert link.bounding_box() == plate_before
        assert before['y'] == plate_before['y'] + plate_before['height']
        assert card.bounding_box()['width'] == plate_before['width'] == before['width']
        assert abs(before['height'] - before['width'] * 9 / 16) < .02
        assert frame.evaluate('el => getComputedStyle(el).borderRadius') == '0px'
        assert page.evaluate('document.documentElement.scrollWidth === innerWidth')
        assert_clean_banner(link, event, oracle, listing_row=False, player=True)
        if variant == 'zlive':
            ad = page.locator('[data-ad-format]')
            expect(ad).to_have_count(1)
            assert ad.bounding_box()['y'] >= before['y'] + before['height']
        page.keyboard.press('Tab')
        link.focus()
        expect(link).to_have_css('outline-offset', '-2px')

        if variant == 'taifood':
            expect(button).to_have_count(0)
        elif variant != 'upcoming':
            expect(button).to_have_text('Sound on')
            assert button.bounding_box()['height'] >= 44
            assert button.evaluate("""button => {
              const audience = button.previousElementSibling.querySelector('.banner-status-tier:last-child').getBoundingClientRect();
              const control = button.getBoundingClientRect();
              return audience.right <= control.left && audience.top === control.top;
            }""")
            original = frame.element_handle()
            button.click()
            expect(button).to_have_text('Muted')
            expect(frame).to_have_attribute('src', ZLIVE)
            assert not original.evaluate('el => el.isConnected')
            expect(button).to_be_focused()
            assert box.bounding_box() == before
            assert not ad_requests and page.evaluate("sessionStorage.getItem('ads:click-under') === null")
            button.click()
            expect(button).to_have_text('Sound on')
            expect(frame).to_have_attribute('src', expected)
            button.click()
            expect(frame).to_have_attribute('src', ZLIVE)
        else:
            expect(button).to_have_text('Sound on')

        page.evaluate('window.heroHidden = true; document.dispatchEvent(new Event("visibilitychange"))')
        expect(frame).to_have_count(0)
        assert box.bounding_box() == before and link.bounding_box() == plate_before
        page.evaluate('window.heroHidden = false; document.dispatchEvent(new Event("visibilitychange"))')
        expect(frame).to_have_attribute('src', expected)
        page.evaluate('window.heroHidden = true; document.dispatchEvent(new Event("visibilitychange"))')
        expect(frame).to_have_count(0)
        page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
        page.wait_for_function('document.querySelector(".hero-player").getBoundingClientRect().bottom < 0')
        page.evaluate('window.heroHidden = false; document.dispatchEvent(new Event("visibilitychange"))')
        page.wait_for_timeout(100)
        expect(frame).to_have_count(0)
        page.evaluate('window.scrollTo(0, 0)')
        expect(frame).to_have_attribute('src', expected)
        page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
        expect(frame).to_have_count(0)
        assert box.bounding_box()['height'] == before['height']
        page.evaluate('window.scrollTo(0, 0)')
        expect(frame).to_have_attribute('src', expected)
        assert box.bounding_box() == before
        assert page.evaluate(CLS_SCORE) == 0
        assert not errors, errors
        link.click()
        page.wait_for_url(re.compile(f'/live/{EVENT}$'))
        assert not ad_requests
        if variant == 'zlive':
            assert page.goto(origin + '/?natural=1', wait_until='domcontentloaded').ok
            expect(frame).to_have_attribute('src', expected)
        print(f"{width}px {variant}: {plate_before['width']:.2f} × {plate_before['height']:.2f} plate, "
              f"{before['width']:.2f} × {before['height']:.2f} player, CLS 0", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    with tempfile.TemporaryDirectory() as temp, sync_playwright() as pw:
        with pw.chromium.launch() as browser:
            oracle = browser.new_page()
            for variant in ('zlive', 'taifood', 'upcoming', 'save-data'):
                listing, event = fixtures(output, variant)
                creative = {'home-banner': {'image': '/banners/house.jpg', 'alt': 'House banner',
                                            'destination': 'https://advertiser.example'}}
                with provider(listing) as feed, worker(Path(temp), variant, output, 'https://advertiser.example',
                        True, variables=lambda _: {'NUXT_PUBLIC_FEED_BASE': feed,
                            'NUXT_PUBLIC_BANNER_CREATIVES': json.dumps(creative) if variant == 'zlive' else '{}'},
                        banner_fixture=output / 'public/og-default.jpg' if variant == 'zlive' else None) as origin:
                    for width in (320, 390, 1024, 1280):
                        check(browser, oracle, origin, feed, listing, event, width, variant)


if __name__ == '__main__':
    main()
