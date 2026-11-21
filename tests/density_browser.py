"""Run against a built Worker with Python Playwright and Chromium installed.

    python tests/density_browser.py .output
    python tests/density_browser.py /path/to/baseline/output --baseline
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import tempfile

from playwright.sync_api import expect, sync_playwright

from banner_browser import EXTERNAL_DESTINATION, IMAGE, PAGES
from click_under_browser import EVENT, worker

VOD = '/vods/hou-mia-full-replay'
ROUTES = (
    ('Home', '/', None, 0.01),
    ('Live event', EVENT, 'Event player', 0.10),
    ('Populated replay', VOD, 'Replay player', 0.10),
)
CATEGORY = ('Basketball category', '/c/basketball', None, 0.01)
SHORT_REPLAY = ('Short replay', VOD, 'Replay player', 0.05)


def populate_basketball(path):
    listing = json.loads(path.read_text())
    category = next(group for group in listing['streams'] if group['category'] == 'Basketball')
    template = category['streams'][0]
    games = [
        ('BOS', 'NYK', 'Celtics vs. Knicks'),
        ('LAL', 'GSW', 'Lakers vs. Warriors'),
        ('MIL', 'CHI', 'Bucks vs. Bulls'),
        ('DAL', 'SAS', 'Mavericks vs. Spurs'),
        ('ORL', 'ATL', 'Magic vs. Hawks'),
        ('POR', 'SAC', 'Trail Blazers vs. Kings'),
        ('CLE', 'DET', 'Cavaliers vs. Pistons'),
        ('IND', 'TOR', 'Pacers vs. Raptors'),
        ('UTA', 'OKC', 'Jazz vs. Thunder'),
        ('MEM', 'NOP', 'Grizzlies vs. Pelicans'),
    ]
    for index, (home, away, name) in enumerate(games):
        start = template['starts_at'] + (index + 1) * 3600
        category['streams'].append(dict(
            template, id=32300 + index, name=name, uri_name=f'basketball/{home.lower()}-{away.lower()}',
            starts_at=start, ends_at=start + 10800,
        ))
    path.write_text(json.dumps(listing))


def snapshot(page, player):
    return page.evaluate("""player => {
      const selectors = ['[data-ad-format]'];
      if (player) selectors.push(`section[aria-label="${player}"] .aspect-video`);
      return {
        documentHeight: document.documentElement.scrollHeight,
        contentHeight: document.querySelector('header + .flex-1 > :first-child').getBoundingClientRect().height,
        boxes: Object.fromEntries(selectors.map(selector => [
          selector, Array.from(document.querySelectorAll(selector), el => {
            const {width, height} = el.getBoundingClientRect();
            return [width, height];
          })
        ]))
      };
    }""", player)


def assert_mode(page, compact, baseline=False):
    label = 'Compact layout' if compact or baseline else 'Comfortable layout'
    button = page.get_by_role('button', name=label, exact=True)
    expect(button).to_have_attribute('aria-pressed', str(compact).lower())
    action = 'comfortable' if compact else 'compact'
    expect(button).to_have_attribute('title', f'Switch to {action} layout')
    expect(page.locator('html')).to_have_attribute('data-density', 'compact' if compact else 'comfortable')
    if page.viewport_size['width'] == 390:
        box = button.bounding_box()
        assert box['width'] >= 44 and box['height'] >= 44, box
    return button


def check_page(browser, origin, width, route, baseline=False, banners=False):
    name, path, player, floor = route
    viewport = 1200 if route == SHORT_REPLAY else 700
    with browser.new_context(viewport={'width': width, 'height': viewport}) as context:
        context.add_init_script("""(() => {
          window.densityModes = [];
          new MutationObserver(changes => {
            for (const change of changes) {
              if (change.oldValue) window.densityModes.push(change.oldValue);
            }
            const mode = document.documentElement?.dataset.density;
            if (mode) window.densityModes.push(mode);
          }).observe(document, {
            subtree: true, attributes: true, attributeFilter: ['data-density'], attributeOldValue: true
          });
        })()""")

        def intercept(route):
            if route.request.url in (f'{origin}/fixtures/one', f'{origin}/fixtures/two'):
                route.fulfill(body='<h1>Playable fixture</h1>', content_type='text/html')
            elif route.request.url.startswith(origin + '/'):
                route.continue_()
            else:
                route.abort()

        context.route('**/*', intercept)
        page = context.new_page()
        response = page.goto(origin + path, wait_until='networkidle')
        assert response.ok, (path, response.status)
        button = assert_mode(page, False, baseline)
        comfortable = snapshot(page, player)
        button.click()
        button = assert_mode(page, True, baseline)
        compact = snapshot(page, player)

        assert comfortable['boxes'] == compact['boxes'], (path, width, comfortable, compact)
        assert bool(compact['boxes']['[data-ad-format]']) == banners
        if player:
            assert len(compact['boxes'][f'section[aria-label="{player}"] .aspect-video']) == 1
        if width == 390 and path == EVENT:
            for control in page.get_by_role('group', name='Playback source').get_by_role('button').all():
                assert control.bounding_box()['height'] >= 44
        if not banners:
            shorter_than_viewport = compact['documentHeight'] <= viewport
            if route == SHORT_REPLAY:
                assert shorter_than_viewport, (width, compact)
            else:
                assert not shorter_than_viewport, (path, width, compact)
            # The flex-1 wrapper grows to fill the viewport. Measure its page child
            # when the document height hits that floor so the spare space is excluded.
            metric = 'contentHeight' if shorter_than_viewport else 'documentHeight'
            before, after = comfortable[metric], compact[metric]
            reduction = (before - after) / before
            print(f'{width}px {name} ({path}, {metric}): {before:g} → {after:g} px ({reduction:.1%})')
            if not baseline:
                assert reduction >= floor, (path, width, reduction, floor)

        assert any(cookie['name'] == 'density' and cookie['value'] == 'compact'
                   for cookie in context.cookies(origin))
        response = page.reload(wait_until='networkidle')
        assert re.search(r'<html\b[^>]*\bdata-density="compact"', response.text())
        button = assert_mode(page, True, baseline)
        assert set(page.evaluate('window.densityModes')) == {'compact'}

        navigation = page.get_by_role('navigation', name='Category jump bar')
        label, destination = ('Basketball', '/c/basketball') if path == '/' else ('All', '/')
        page.evaluate('window.densityNavigation = true')
        navigation.get_by_role('link', name=label, exact=True).click()
        page.wait_for_url(origin + destination)
        assert page.evaluate('window.densityNavigation') is True
        assert set(page.evaluate('window.densityModes')) == {'compact'}
        button = assert_mode(page, True, baseline)
        button.click()
        assert_mode(page, False, baseline)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--baseline', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as temp, sync_playwright() as pw:
        directory = Path(temp)
        output = directory / 'output'
        shutil.copytree(args.output, output)
        vod_path = output / 'public/fixtures/vod.json'
        original_replay = vod_path.read_text()
        replay = json.loads(original_replay)['data']
        replay['source'] = {'type': 'link', 'data': '/fixtures/away.html'}
        replay['recommended_vods'] = [
            dict(replay, id=9002, uri_name='another-replay', name='Another replay', recommended_vods=[]),
        ]
        vod_path.write_text(json.dumps({'success': True, 'data': replay}))
        browser = pw.chromium.launch()
        with worker(directory, 'density', output, EXTERNAL_DESTINATION, False, player='/fixtures') as origin:
            for width in (390, 1280):
                for route in ROUTES:
                    check_page(browser, origin, width, route, args.baseline)

        if not args.baseline:
            def variables(origin):
                return {'NUXT_PUBLIC_BANNER_CREATIVES': json.dumps({
                    placement: {'image': IMAGE, 'alt': 'House banner', 'destination': f'{origin}/fixtures/away.html'}
                    for placement in PAGES
                })}

            with worker(directory, 'density-banners', output, EXTERNAL_DESTINATION, True, player='/fixtures',
                        variables=variables, banner_fixture=output / 'public/og-default.jpg') as origin:
                for width in (390, 1280):
                    check_page(browser, origin, width, ROUTES[0], banners=True)
                    check_page(browser, origin, width, ROUTES[1], banners=True)
                    check_page(browser, origin, width, ('Archive', '/vods', None, 0), banners=True)
            print('Player and banner dimensions match in both modes at both widths')
        vod_path.write_text(original_replay)
        populate_basketball(output / 'public/fixtures/streams.json')
        with worker(directory, 'density-category', output, EXTERNAL_DESTINATION, False, player='/fixtures') as origin:
            for width in (390, 1280):
                check_page(browser, origin, width, CATEGORY, args.baseline)
                check_page(browser, origin, width, SHORT_REPLAY, args.baseline)
        browser.close()


if __name__ == '__main__':
    main()
