"""Run from the repository root after pnpm build.

    python tests/banner_browser.py .output
"""
import argparse
from contextlib import ExitStack
import json
from pathlib import Path
import tempfile
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

from click_under_browser import CLS_OBSERVER, CLS_SCORE, EVENT, worker

PAGES = {'home-banner': '/', 'event-banner': EVENT, 'vods-banner': '/vods'}
IMAGE = '/banners/house.jpg'
MISSING_IMAGE = '/banners/missing.webp'
EXTERNAL_DESTINATION = 'https://advertiser.example/landing'


def expect_keyboard_link(page, slot, link):
    slot.evaluate("""slot => {
      for (const [name, place] of [['Before banner', 'before'], ['After banner', 'after']]) {
        const button = document.createElement('button');
        button.textContent = name;
        button.style.position = 'absolute';
        slot[place](button);
      }
    }""")
    page.get_by_role('button', name='Before banner').focus()
    page.keyboard.press('Tab')
    expect(link).to_be_focused()
    page.keyboard.press('Tab')
    expect(page.get_by_role('button', name='After banner')).to_be_focused()
    slot.evaluate("""slot => {
      slot.previousElementSibling.remove();
      slot.nextElementSibling.remove();
    }""")


def check_page(browser, origin, placement, width, has_creative, *, failure=False, missing=False):
    context = browser.new_context(viewport={'width': width, 'height': 850})
    try:
        context.add_init_script(CLS_OBSERVER)
        external = []
        redirects = []
        click_url = None
        pending = []
        hold_image = True

        def intercept(route):
            path = urlsplit(route.request.url).path
            if path in ('/go/source', '/go/play'):
                redirects.append(route.request.url)
            if not route.request.url.startswith(origin + '/'):
                external.append(route.request.url)
                route.abort()
            elif path in ('/fixtures/one', '/fixtures/two'):
                route.fulfill(body='<h1>Playable fixture</h1>', content_type='text/html')
            elif hold_image and path in (IMAGE, MISSING_IMAGE):
                pending.append(route)
            else:
                route.continue_()

        context.route('**/*', intercept)
        page = context.new_page()
        response = page.goto(origin + PAGES[placement], wait_until='domcontentloaded')
        assert response.ok
        html = response.text()
        path = MISSING_IMAGE if failure else IMAGE
        assert (f'src="{path}"' in html) == (has_creative and not missing)
        assert (f'href="/go/{placement}?' in html) == has_creative
        slot = page.locator('[data-ad-format]')
        expect(slot).to_have_count(int(has_creative))
        page.wait_for_timeout(250)
        initial = page.evaluate(CLS_SCORE)
        initial_entries = page.evaluate("layoutShifts.length")
        if has_creative:
            slot.scroll_into_view_if_needed()
            label = slot.get_by_text('Advertisement', exact=True)
            expect(label).to_be_visible()
            assert 'Advertisement' in slot.aria_snapshot()
            box = slot.bounding_box()
            assert (box['width'], box['height']) == ((320, 100) if width == 390 else (970, 90)), box
            link = slot.get_by_role('link')
            if not missing:
                expect(link).to_have_accessible_name(f'House {placement}')
                for _ in range(20):
                    if pending:
                        break
                    page.wait_for_timeout(100)
                assert len(pending) == 1
                pending.pop().continue_()
                if failure:
                    expect(slot.locator('img')).to_have_count(0)
                    expect(label).to_be_visible()
                else:
                    slot.locator('img').evaluate('image => image.decode()')
            else:
                expect(slot.locator('img')).to_have_count(0)
            expect(link).to_have_accessible_name(f'House {placement}')
            expect(link).to_have_accessible_description('Advertisement')
            expect(link).to_have_attribute('rel', 'sponsored noopener noreferrer')
            click_url = link.get_attribute('href')
            assert slot.bounding_box() == box
        page.wait_for_timeout(250)
        final = page.evaluate(CLS_SCORE)
        assert final == initial, (placement, width, initial, final)
        assert page.evaluate("layoutShifts.length") == initial_entries
        if has_creative:
            expect_keyboard_link(page, slot, link)
            if placement == 'event-banner':
                for cap in (None, '1'):
                    page.evaluate("""cap => cap === null ? sessionStorage.removeItem('ads:click-under')
                        : sessionStorage.setItem('ads:click-under', cap)""", cap)
                    with context.expect_page() as opened:
                        link.press('Enter')
                    opened.value.wait_for_url(f'{origin}/fixtures/away')
                    opened.value.close()
                    assert page.evaluate("sessionStorage.getItem('ads:click-under')") == cap
        document_start = page.evaluate("performance.timeOrigin")
        hold_image = False
        page.locator('a[href="/about"]').click()
        page.wait_for_url(origin + '/about')
        page.go_back(wait_until='domcontentloaded')
        expect(slot).to_have_count(int(has_creative))
        assert page.evaluate("performance.timeOrigin") == document_start
        assert not redirects, redirects
        assert not external, external
        mode = 'failed' if failure else 'missing image' if missing else 'creative' if has_creative else 'empty'
        print(f'{width}px {placement} {mode}: CLS {initial:.7f} → {final:.7f}', flush=True)
        return click_url
    finally:
        context.close()


def check_without_javascript(browser, origin, *, failure=False):
    context = browser.new_context(java_script_enabled=False, viewport={'width': 390, 'height': 850})
    try:
        def intercept(route):
            if not route.request.url.startswith(origin + '/'):
                route.abort()
            else:
                route.continue_()

        context.route('**/*', intercept)
        page = context.new_page()
        page.goto(origin + (EVENT if failure else '/'), wait_until='networkidle')
        slot = page.locator('[data-ad-format]')
        slot.scroll_into_view_if_needed()
        image = slot.locator('img')
        placement = 'event-banner' if failure else 'home-banner'
        link = slot.get_by_role('link', name=f'House {placement}')
        expect(link).to_have_accessible_description('Advertisement')
        expect(image).to_have_accessible_name(f'House {placement}')
        expect_keyboard_link(page, slot, link)
        box = slot.bounding_box()
        assert (box['width'], box['height']) == (320, 100)
        redirect = context.request.get(origin + link.get_attribute('href'), max_redirects=0)
        assert redirect.status == 302 and redirect.headers['location'] == f'{origin}/fixtures/away'
        image.evaluate('image => image.decode().catch(() => {})')
        assert image.evaluate('image => image.naturalWidth > 0') is not failure
        # Ignore corner antialiasing differences between one and two painted surfaces.
        slot.evaluate("slot => slot.style.borderRadius = '0'")
        with_image = slot.screenshot()
        image.evaluate("image => image.closest('a').remove()")
        assert (with_image == slot.screenshot()) is failure
        assert slot.bounding_box() == box
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp, sync_playwright() as pw, ExitStack() as stack:
        directory = Path(temp)
        output = args.output.resolve()

        def start(name, enabled, images):
            def variables(origin):
                creatives = {
                    placement: {'image': image, 'alt': f'House {placement}', 'destination': f'{origin}/fixtures/away'}
                    for placement, image in images.items()
                }
                return {'NUXT_PUBLIC_BANNER_CREATIVES': json.dumps(creatives)}

            return stack.enter_context(worker(directory, name, output, EXTERNAL_DESTINATION, enabled, player='/fixtures',
                                              variables=variables, banner_fixture=output / 'public/og-default.jpg'))

        on = start('banner-on', True, dict.fromkeys(PAGES, IMAGE))
        off = start('banner-off', False, dict.fromkeys(PAGES, IMAGE))
        replacement = start('banner-replacement', True, {'home-banner': IMAGE})
        partial = start('banner-partial', True, {'home-banner': '/go/source', 'event-banner': MISSING_IMAGE, 'vods-banner': ''})
        browser = pw.chromium.launch()
        for width in (390, 1280):
            for placement in PAGES:
                click_url = check_page(browser, on, placement, width, True)
                if placement == 'home-banner':
                    home_click_url = click_url
                check_page(browser, off, placement, width, False)
            check_page(browser, partial, 'home-banner', width, False)
            check_page(browser, partial, 'event-banner', width, True, failure=True)
            check_page(browser, partial, 'vods-banner', width, True, missing=True)
        api = pw.request.new_context()
        stack.callback(api.dispose)
        redirect = api.get(f'{partial}/go/source', max_redirects=0)
        assert redirect.status == 302 and redirect.headers['location'] == EXTERNAL_DESTINATION
        stale = api.get(f'{replacement}{home_click_url}', max_redirects=0)
        assert stale.status == 410 and 'location' not in stale.headers
        check_without_javascript(browser, on)
        check_without_javascript(browser, partial, failure=True)
        asset = api.get(on + IMAGE, max_redirects=0)
        assert asset.status == 200 and asset.headers['content-type'] == 'image/jpeg'
        assert 'location' not in asset.headers and asset.body() == (output / 'public/og-default.jpg').read_bytes()
        missing = api.get(on + MISSING_IMAGE, max_redirects=0)
        assert missing.status == 404 and 'location' not in missing.headers
        query = '?v=creative%2F1&v=2'
        mirror = api.get(
            f'{on}{IMAGE}{query}', headers={'x-forwarded-host': 'kwip.lol'}, max_redirects=0,
        )
        assert mirror.status == 301
        assert mirror.headers['location'] == f'https://kwip.fyi{IMAGE}{query}'
        canonical = api.get(
            f'{on}{IMAGE}{query}', headers={'x-forwarded-host': 'kwip.fyi'}, max_redirects=0,
        )
        assert canonical.status == 200 and canonical.body() == asset.body()
        print('R2 serves image bytes and 404s directly on the canonical host; mirror preserves path and query')
        print('JavaScript disabled: loaded and failed creatives retain a named, tabbable sponsored link')
        browser.close()


if __name__ == '__main__':
    main()
