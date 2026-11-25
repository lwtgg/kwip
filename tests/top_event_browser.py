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
               starts_at=now-60, ends_at=now+7200, iframe=TAIFOOD.replace('https:', 'http:'), always_live=0, poster='')
    popular = dict(top, name='Popular fixture', uri_name='basketball/popular', id=8001, viewers='1000')
    if variant.startswith('taifood') or variant.startswith('no-embed'):
        popular['viewers'] = '50'
    else:
        top['hero_embed'] = ZLIVE
        if variant == 'zlive-http':
            top['hero_embed'] = ZLIVE.replace('https:', 'http:')
        elif variant == 'zlive-443':
            top['hero_embed'] = ZLIVE.replace('https://zlive.st/embed/TSN4', 'http://user:secret@zlive.st:443/embed/TSN4/')
    if variant.startswith('no-embed'):
        top['iframe'] = ''
        if variant == 'no-embed-unmatched':
            top.pop('match')
    if variant.startswith('upcoming'):
        top.update(starts_at=now+60, match=dict(match, state='pre', detail='Scheduled',
                   away=dict(match['away'], score=None), home=dict(match['home'], score=None)))
        popular['starts_at'] = now+120
    fillers = [dict(popular, uri_name=f'basketball/filler-{i}', id=9000+i, starts_at=now+3600)
               for i in range(18)]
    return dict(listing, timestamp=now - 1800 if variant == 'stale' else now, streams=[
        dict(listing['streams'][0], always_live=0, streams=[popular, top, *fillers])
    ]), top


def refresh_feed(page):
    page.evaluate('''async () => {
      const app = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt;
      await app.callHook('app:data:refresh');
    }''')


def check_below_fold(page, box, frame, button, expected):
    # Expose just the control while keeping the player below the viewport.
    button.evaluate('''button => {
      const bottom = button.getBoundingClientRect().bottom;
      window.scrollBy(0, Math.max(0, bottom - innerHeight));
    }''')
    expect(button).to_be_in_viewport(ratio=0.99)
    assert box.evaluate('box => box.getBoundingClientRect().top >= innerHeight')
    expect(frame).to_have_count(0)
    expect(button).to_have_accessible_name('Play')
    button.click()
    expect(frame).to_have_attribute('src', expected, timeout=4000)
    expect(box).to_be_in_viewport()
    expect(button).to_be_focused()
    expect(button).to_have_accessible_name('Sound on')
    assert button.evaluate('''button => {
      const { x, y, width, height } = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    }'''), 'The Play tap left the sound control covered or outside the viewport'
    button.click()
    expect(button).to_have_accessible_name('Mute')
    expect(frame).to_have_attribute('src', ZLIVE)


def check(browser, oracle, origin, feed, listing, event, width, variant, root_text=False,
          height=850, below_fold=False):
    https_page = variant in ('taifood', 'zlive-http', 'zlive-443')
    worker_origin = origin
    if https_page:
        origin = origin.replace('http:', 'https:')
    with browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce') as context:
        context.add_init_script(CLS_OBSERVER)
        context.add_init_script('''(() => {
          window.heroHidden = !location.search.includes('natural=1');
          Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => window.heroHidden ? 'hidden' : 'visible'});
          Object.defineProperty(navigator, 'connection', {value: new EventTarget()});
          navigator.connection.saveData = SAVE_DATA;
        })();'''.replace('SAVE_DATA', str(variant.endswith('save-data')).lower()))
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
                if https_page and url.startswith(origin + '/'):
                    route.fulfill(response=route.fetch(url=worker_origin + url[len(origin):]))
                else:
                    route.continue_()
            else:
                route.abort()

        context.route('**/*', intercept)
        page = context.new_page()
        errors = []
        collect_render_errors(page, errors)
        assert page.goto(origin, wait_until='networkidle').ok
        # Exercise the browser's provider path with the same payload as the SSR provider.
        refresh_feed(page)
        assert feed_requests == [feed + '/streams'], feed_requests
        if root_text:
            root = page.locator('html')
            root.evaluate("element => { element.style.fontSize = '200%'; }")
            expect(root).to_have_css('font-size', '32px')
        hero = page.get_by_role('region', name='Featured event')
        card = hero.locator('.hero-card')
        link = hero.get_by_role('link')
        box = hero.locator('.hero-player')
        frame = box.locator('iframe')
        button = hero.get_by_role('button')
        expect(link).to_have_attribute('href', f'/live/{EVENT}')
        if variant.startswith('no-embed'):
            expect(box).to_have_count(0)
            expect(card).to_have_count(0)
            expect(button).to_have_count(0)
            assert hero.bounding_box()['height'] == link.bounding_box()['height']
            if variant == 'no-embed-matched':
                assert_clean_banner(link, event, oracle, listing_row=False)
            else:
                expect(link.locator('.card-art')).to_be_visible()
            assert not player_requests and not errors, (player_requests, errors)
            print(f"{width}px {variant}: banner only", flush=True)
            return
        assert box.evaluate('(box) => box.previousElementSibling.classList.contains("hero-plate")')
        assert not link.locator('iframe, button').count()
        expect(frame).to_have_count(0)
        page.evaluate('document.fonts.ready')
        settle_fit(page)
        if root_text:
            # The test changes the root size after navigation. Measure from the settled 200% layout.
            page.evaluate('layoutShifts.length = 0')
        before = box.bounding_box()
        plate = hero.locator('.hero-plate')
        plate_before = plate.bounding_box()
        page.evaluate('window.heroHidden = false; document.dispatchEvent(new Event("visibilitychange"))')

        taifood = variant.startswith('taifood')
        held = variant.endswith('save-data') and not taifood
        change_save_data = '''enabled => {
          navigator.connection.saveData = enabled;
          navigator.connection.dispatchEvent(new Event('change'));
        }'''

        def refresh_listing():
            request_count = len(feed_requests)
            refresh_feed(page)
            assert feed_requests[request_count:] == [feed + '/streams']

        def assert_frame_kept(label):
            expect(frame.content_frame.get_by_role('heading', name='Third-party fixture')).to_be_visible()
            mounted = frame.element_handle()
            src = frame.get_attribute('src')
            requests = player_requests.copy()
            refresh_listing()
            expect(frame).to_have_count(1)
            expect(frame).to_have_attribute('src', src)
            expect(button).to_have_accessible_name(label)
            expect(button).to_be_focused()
            assert mounted.evaluate('el => el.isConnected')
            assert player_requests == requests

        if below_fold:
            if variant == 'stale':
                expect(hero.locator('.hero-footer').locator('[aria-hidden=true]')).to_have_count(0)
            check_below_fold(page, box, frame, button, ZLIVE + '&muted=1')
            assert not errors, errors
            print(f"{width}×{height} {variant} at {200 if root_text else 100}%: Play scrolled into view and mounted muted",
                  flush=True)
            return
        if held:
            page.wait_for_timeout(100)
            expect(frame).to_have_count(0)
            assert not player_requests
            expect(button).to_have_accessible_name('Play')
            expect(button).to_be_enabled()
            button.focus()
            page.evaluate('window.heroHidden = true; document.dispatchEvent(new Event("visibilitychange"))')
            expect(button).to_be_focused()
            page.evaluate('window.heroHidden = false; document.dispatchEvent(new Event("visibilitychange"))')
            expect(button).to_be_focused()
            held_target = button.bounding_box()
            scroll = page.evaluate("({ left: scrollX, top: scrollY })")
            button.click()
            expect(button).to_be_focused()
            expect(button).to_have_accessible_name('Sound on')
            # Play may scroll a partially visible box. Compare layout at the same scroll position.
            page.evaluate('scroll => window.scrollTo(scroll)', scroll)
            assert button.bounding_box() == held_target

        expected = TAIFOOD if taifood else ZLIVE + '&muted=1'
        if variant.startswith('upcoming'):
            expected += '&autoplay=0'
        expect(frame).to_have_attribute('src', expected, timeout=4000)
        if variant == 'save-data' and not root_text:
            original_listing = listing
            category = listing['streams'][0]
            updated_viewers = dict(event, viewers='63')
            for updated, visible_text in (
                (event, '62'),
                (updated_viewers, '63'),
                (dict(updated_viewers, match=dict(event['match'], state='post', detail='Final')), 'Final'),
            ):
                listing = dict(original_listing, streams=[dict(category, streams=[
                    updated if stream['uri_name'] == EVENT else stream for stream in category['streams']
                ])])
                assert_frame_kept('Sound on')
                expect(link).to_have_accessible_name(re.compile(rf'\b{visible_text}\b'))
            listing = original_listing
            assert_frame_kept('Sound on')
        if taifood:
            assert frame.get_attribute('sandbox') is None
        else:
            expect(frame).to_have_attribute('sandbox', SANDBOX)
        expect(frame).to_have_attribute('allow', 'autoplay; fullscreen; picture-in-picture')
        expect(frame.content_frame.get_by_role('heading', name='Third-party fixture')).to_be_visible()
        assert player_requests[0] == expected
        if https_page:
            assert urlsplit(page.url).scheme == 'https'
            assert urlsplit(frame.get_attribute('src')).scheme == 'https'
        assert box.bounding_box() == before
        assert plate.bounding_box() == plate_before
        assert before['y'] == plate_before['y'] + plate_before['height']
        assert card.bounding_box()['width'] == plate_before['width'] == before['width']
        assert abs(before['height'] - before['width'] * 9 / 16) < .02
        assert frame.evaluate('el => getComputedStyle(el).borderRadius') == '0px'
        if root_text:
            assert card.evaluate('el => el.scrollWidth === el.clientWidth && el.getBoundingClientRect().right <= innerWidth')
        else:
            assert page.evaluate('document.documentElement.scrollWidth === innerWidth')
        assert_clean_banner(link, event, oracle, listing_row=False)
        if variant == 'zlive':
            ad = page.locator('[data-ad-format]')
            expect(ad).to_have_count(1)
            assert ad.bounding_box()['y'] >= before['y'] + before['height']
        page.keyboard.press('Tab')
        link.focus()
        expect(link).to_have_css('outline-offset', '-4px' if root_text else '-2px')

        audience = link.locator('.banner-status-tier').get_by_text('62 Viewers', exact=True)
        expect(audience).to_be_visible()
        expect(link).to_have_accessible_name(re.compile(r'62 Viewers'))
        footer = hero.locator('.hero-footer')
        if taifood:
            expect(footer).to_have_count(0)
            expect(button).to_have_count(0)
        else:
            expect(footer.locator(':scope > *')).to_have_count(1)
            expect(button).to_have_accessible_name('Sound on')
            expect(button).to_be_enabled()
            target = button.bounding_box()
            assert target['height'] >= 44 and target['width'] >= 44, target
            # The footer holds only the button, disjoint from the banner and from the audience it used to sit beside.
            geometry = hero.evaluate("""hero => {
              const button = hero.querySelector('.hero-footer button').getBoundingClientRect();
              const link = hero.querySelector('.hero-plate-link').getBoundingClientRect();
              const audience = hero.querySelector('.banner-status-tier:nth-child(3) .banner-status-line');
              const range = document.createRange();
              range.selectNodeContents(audience);
              const disjoint = rect => rect.right <= button.left || button.right <= rect.left
                || rect.bottom <= button.top || button.bottom <= rect.top;
              return {
                disjoint: disjoint(link) && disjoint(audience.getBoundingClientRect())
                  && [...range.getClientRects()].every(disjoint),
                below: link.bottom <= button.top,
              };
            }""")
            assert geometry['disjoint'] and geometry['below'], geometry
            assert target['y'] + target['height'] <= before['y'], (target, before)
            original = frame.element_handle()
            sound_url = ZLIVE + ('&autoplay=0' if variant.startswith('upcoming') else '')
            button.click()
            expect(button).to_have_accessible_name('Mute')
            expect(frame).to_have_attribute('src', sound_url)
            assert not original.evaluate('el => el.isConnected')
            expect(button).to_be_focused()
            assert box.bounding_box() == before
            assert button.bounding_box() == target
            assert not ad_requests and page.evaluate("sessionStorage.getItem('ads:click-under') === null")
            button.click()
            expect(button).to_have_accessible_name('Sound on')
            expect(frame).to_have_attribute('src', expected)
            button.click()
            expect(frame).to_have_attribute('src', sound_url)

        page.evaluate('window.heroHidden = true; document.dispatchEvent(new Event("visibilitychange"))')
        expect(frame).to_have_count(0)
        if not taifood:
            expect(button).to_be_focused()
            expect(button).to_be_enabled()
            expect(button).to_have_accessible_name('Play')
        assert box.bounding_box() == before and plate.bounding_box() == plate_before
        page.evaluate('window.heroHidden = false; document.dispatchEvent(new Event("visibilitychange"))')
        expect(frame).to_have_attribute('src', expected)
        if not taifood:
            expect(button).to_be_focused()
            expect(button).to_have_accessible_name('Sound on')
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
        page.wait_for_function('document.querySelector(".hero-player").getBoundingClientRect().top < innerHeight')
        expect(frame).to_have_attribute('src', expected, timeout=8000)
        assert box.bounding_box() == before
        assert page.evaluate(CLS_SCORE) == 0
        assert not errors, errors
        if variant == 'zlive' and not root_text:
            mounted_frame = frame.element_handle()
            button.focus()
            page.evaluate(change_save_data, True)
            expect(button).to_have_accessible_name('Sound on')
            assert mounted_frame.evaluate('el => el.isConnected')
            assert_frame_kept('Sound on')
            page.evaluate('window.heroHidden = true; document.dispatchEvent(new Event("visibilitychange"))')
            expect(frame).to_have_count(0)
            page.evaluate('window.heroHidden = false; document.dispatchEvent(new Event("visibilitychange"))')
            expect(button).to_have_accessible_name('Play')
            expect(frame).to_have_count(0)

            page.evaluate(change_save_data, False)
            expect(frame).to_have_attribute('src', expected)
            button.click()
            expect(button).to_have_accessible_name('Mute')
            audible_frame = frame.element_handle()
            page.evaluate(change_save_data, True)
            expect(frame).to_have_attribute('src', ZLIVE)
            expect(button).to_have_accessible_name('Mute')
            assert audible_frame.evaluate('el => el.isConnected')

            # Keep the same source so the URI change alone must reset playback permission.
            original_listing = listing
            category = listing['streams'][0]
            replacement = dict(event, uri_name='basketball/replacement')
            listing = dict(listing, streams=[dict(category, streams=[
                replacement if stream['uri_name'] == EVENT else stream for stream in category['streams']
            ])])
            refresh_feed(page)
            expect(link).to_have_attribute('href', '/live/basketball/replacement')
            expect(button).to_have_accessible_name('Play')
            expect(frame).to_have_count(0)
            button.click()
            expect(frame).to_have_attribute('src', expected)
            expect(button).to_have_accessible_name('Sound on')
            listing = original_listing
            refresh_feed(page)
            expect(link).to_have_attribute('href', f'/live/{EVENT}')
            expect(button).to_have_accessible_name('Play')
            expect(frame).to_have_count(0)

            # A Play tap while hidden survives a refresh before the tab returns.
            page.evaluate('window.heroHidden = true; document.dispatchEvent(new Event("visibilitychange"))')
            requests = player_requests.copy()
            button.click()
            expect(button).to_have_accessible_name('Play')
            refresh_listing()
            expect(frame).to_have_count(0)
            expect(button).to_be_focused()
            assert player_requests == requests
            page.evaluate('window.heroHidden = false; document.dispatchEvent(new Event("visibilitychange"))')
            expect(frame).to_have_attribute('src', expected)
            expect(button).to_have_accessible_name('Sound on')
            expect(button).to_be_focused()
        if variant in ('taifood-save-data', 'save-data') and not root_text:
            upgraded_embed = ZLIVE if taifood else ZLIVE.replace('/TSN4', '/TSN5')
            category = listing['streams'][0]
            listing = dict(listing, streams=[dict(category, streams=[
                dict(event, hero_embed=upgraded_embed) if stream['uri_name'] == EVENT else stream
                for stream in category['streams']
            ])])
            player_requests.clear()
            refresh_feed(page)
            expect(link).to_have_attribute('href', f'/live/{EVENT}')
            expect(button).to_have_accessible_name('Play')
            expect(frame).to_have_count(0)
            assert not player_requests, player_requests
            button.click()
            upgraded_muted = upgraded_embed + '&muted=1'
            expect(frame).to_have_attribute('src', upgraded_muted)
            expect(frame.content_frame.get_by_role('heading', name='Third-party fixture')).to_be_visible()
            assert player_requests == [upgraded_muted], player_requests
            expect(button).to_have_accessible_name('Sound on')
        link.click()
        page.wait_for_url(re.compile(f'/live/{EVENT}$'))
        assert not ad_requests
        if variant == 'zlive' and not root_text:
            assert page.goto(origin + '/?natural=1', wait_until='domcontentloaded').ok
            expect(frame).to_have_attribute('src', expected)
        if https_page:
            # Let the test's HTTP-backed HTTPS routes finish before closing the context.
            page.wait_for_load_state('networkidle')
        assert not errors, errors
        print(f"{width}px {variant} at {200 if root_text else 100}%: {plate_before['width']:.2f} × {plate_before['height']:.2f} plate, "
              f"{before['width']:.2f} × {before['height']:.2f} player, CLS 0", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--below-fold-only', action='store_true', help='Run only the Play regression cases')
    args = parser.parse_args()
    output = args.output.resolve()
    with tempfile.TemporaryDirectory() as temp, sync_playwright() as pw:
        with pw.chromium.launch() as browser:
            oracle = browser.new_page()
            variants = ('zlive', 'taifood', 'upcoming', 'save-data', 'upcoming-save-data', 'taifood-save-data',
                        'no-embed-matched', 'no-embed-unmatched', 'zlive-http', 'zlive-443', 'stale')
            if args.below_fold_only:
                variants = ('zlive', 'save-data', 'stale')
            for variant in variants:
                listing, event = fixtures(output, variant)
                creative = {'home-banner': {'image': '/banners/house.jpg', 'alt': 'House banner',
                                            'destination': 'https://advertiser.example'}}
                with provider(listing) as feed, worker(Path(temp), variant, output, 'https://advertiser.example',
                        True, variables=lambda _: {'NUXT_PUBLIC_FEED_BASE': feed,
                            'NUXT_PUBLIC_BANNER_CREATIVES': json.dumps(creative) if variant == 'zlive' else '{}'},
                        banner_fixture=output / 'public/og-default.jpg' if variant == 'zlive' else None) as origin:
                    if not args.below_fold_only and variant != 'stale':
                        for width in (320, 390, 1024, 1280):
                            check(browser, oracle, origin, feed, listing, event, width, variant)
                        if variant in ('zlive', 'save-data'):
                            for width in (320, 390):
                                check(browser, oracle, origin, feed, listing, event, width, variant,
                                      root_text=True, height=1300)
                    if variant in ('zlive', 'save-data', 'stale'):
                        widths = (1024, 1280) if variant == 'stale' else (320, 390)
                        for width in widths:
                            # The footer no longer stacks the audience over the button (task 60), so the
                            # 200% hero is shorter; a 500px viewport keeps the button below the fold.
                            check(browser, oracle, origin, feed, listing, event, width, variant,
                                  root_text=True, below_fold=True, height=850 if variant == 'stale' else 500)
                    if variant == 'zlive':
                        for width, height in ((844, 390), (667, 375), (932, 430), (1280, 500)):
                            check(browser, oracle, origin, feed, listing, event, width, variant,
                                  height=height, below_fold=True)


if __name__ == '__main__':
    main()
