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
IMAGE = '/og-default.jpg'


def check_page(browser, origin, placement, width, has_creative, *, failure=False, missing=False):
    context = browser.new_context(viewport={'width': width, 'height': 850})
    try:
        context.add_init_script(CLS_OBSERVER)
        external = []
        pending = []
        hold_image = True

        def intercept(route):
            path = urlsplit(route.request.url).path
            if not route.request.url.startswith(origin + '/'):
                external.append(route.request.url)
                route.abort()
            elif path in ('/fixtures/one', '/fixtures/two'):
                route.fulfill(body='<h1>Playable fixture</h1>', content_type='text/html')
            elif hold_image and path in (IMAGE, '/banner-missing.webp'):
                pending.append(route)
            else:
                route.continue_()

        context.route('**/*', intercept)
        page = context.new_page()
        response = page.goto(origin + PAGES[placement], wait_until='domcontentloaded')
        assert response.ok
        html = response.text()
        href = f'/go/{placement}'
        assert (f'href="{href}"' in html) == (has_creative and not missing)
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
                expect(link).to_have_accessible_description('Advertisement')
                expect(link).to_have_attribute('rel', 'sponsored noopener noreferrer')
                # Tab from the preceding focusable element, using actual keyboard navigation.
                link.evaluate("""link => {
                  const previous = document.createElement('button');
                  previous.textContent = 'Focus start';
                  previous.style.position = 'absolute';
                  link.before(previous);
                  previous.focus();
                }""")
                page.keyboard.press('Tab')
                expect(link).to_be_focused()
                link.evaluate("link => link.previousElementSibling.remove()")
                for _ in range(20):
                    if pending:
                        break
                    page.wait_for_timeout(100)
                assert len(pending) == 1
                if failure:
                    pending.pop().fulfill(status=404)
                    expect(slot.locator('img')).to_have_count(0)
                    expect(label).to_be_visible()
                else:
                    pending.pop().continue_()
                    expect(slot.locator('img')).to_have_css('opacity', '1')
                    if placement == 'event-banner':
                        for cap in (None, '1'):
                            page.evaluate("""cap => cap === null ? sessionStorage.removeItem('ads:click-under')
                                : sessionStorage.setItem('ads:click-under', cap)""", cap)
                            with context.expect_page() as opened:
                                link.press('Enter')
                            opened.value.wait_for_url(f'{origin}/fixtures/away')
                            opened.value.close()
                            assert page.evaluate("sessionStorage.getItem('ads:click-under')") == cap
            else:
                expect(slot.locator('img, a')).to_have_count(0)
            assert slot.bounding_box() == box
        page.wait_for_timeout(250)
        final = page.evaluate(CLS_SCORE)
        assert final == initial, (placement, width, initial, final)
        assert page.evaluate("layoutShifts.length") == initial_entries
        document_start = page.evaluate("performance.timeOrigin")
        hold_image = False
        page.locator('a[href="/about"]').click()
        page.wait_for_url(origin + '/about')
        page.go_back(wait_until='domcontentloaded')
        expect(slot).to_have_count(int(has_creative))
        assert page.evaluate("performance.timeOrigin") == document_start
        assert not external, external
        mode = 'failed' if failure else 'missing image' if missing else 'creative' if has_creative else 'empty'
        print(f'{width}px {placement} {mode}: CLS {initial:.7f} → {final:.7f}', flush=True)
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp, ExitStack() as stack, sync_playwright() as pw:
        directory = Path(temp)
        output = args.output.resolve()

        def start(name, enabled, images):
            def variables(origin):
                creatives = {
                    placement: {'image': image, 'alt': f'House {placement}', 'destination': f'{origin}/fixtures/away'}
                    for placement, image in images.items()
                }
                return {'NUXT_PUBLIC_BANNER_CREATIVES': json.dumps(creatives)}

            return stack.enter_context(worker(directory, name, output, '', enabled, player='/fixtures', variables=variables))

        on = start('banner-on', True, dict.fromkeys(PAGES, IMAGE))
        off = start('banner-off', False, dict.fromkeys(PAGES, IMAGE))
        partial = start('banner-partial', True, {'event-banner': '/banner-missing.webp', 'vods-banner': ''})
        browser = pw.chromium.launch()
        for width in (390, 1280):
            for placement in PAGES:
                check_page(browser, on, placement, width, True)
                check_page(browser, off, placement, width, False)
            check_page(browser, partial, 'home-banner', width, False)
            check_page(browser, partial, 'event-banner', width, True, failure=True)
            check_page(browser, partial, 'vods-banner', width, True, missing=True)
        browser.close()


if __name__ == '__main__':
    main()
