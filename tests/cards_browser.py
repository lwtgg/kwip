"""50a card matrix. Run after pnpm build: python tests/cards_browser.py .output --screenshots /tmp/kwip50a-shots"""
from banner_rendered_contrast import assert_banner_contrast
import argparse
from datetime import datetime, timezone
import json
import re
from pathlib import Path
import tempfile
import time
from playwright.sync_api import expect, sync_playwright
from click_under_browser import worker, CLS_OBSERVER, CLS_SCORE


def fixtures(assets, stale=False):
    now = int(time.time())
    listing = json.loads((assets / 'fixtures/streams.json').read_text())
    template = listing['streams'][0]['streams'][0]
    cases = [
        ('two-seeds', dict(colors=['#f00', '#00f'])),
        ('one-unreadable-seed', dict(colors=['#fff'])),
        ('no-poster', dict(poster='')),
        ('failed-art', dict(poster='/fixtures/missing.jpg')),
        ('long-name', dict(name='International championship quarterfinal: a very long complete event name with every participant and the full venue description retained')),
        ('unknown-time', dict(starts_at=0, ends_at=0)),
        ('invalid-start', dict(starts_at=-1, ends_at=now+7200)),
        ('invalid-end', dict(starts_at=now+7200, ends_at=now-60)),
        ('missing-end', dict(starts_at=now-60, ends_at=0)),
        ('channel', dict(always_live=1, starts_at=0, ends_at=0)),
        ('ended', dict(starts_at=now-7200, ends_at=now-60)),
        ('no-seeds', dict(colors=[], viewers='1')),
        ('bad-seeds', dict(colors=['not-a-color', '#12345678'])),
        ('live', dict(starts_at=now-60, ends_at=now+7200)),
    ]
    events = [dict(template, id=8000+i, name=label.replace('-', ' ').capitalize(), uri_name=f'basketball/{label}',
                   poster='/og-default.jpg', starts_at=now+7200, ends_at=now+14400,
                   viewers=str(100-i), **{}) for i, (label, _) in enumerate(cases)]
    for event, (_, changes) in zip(events, cases):
        event.update(changes)
    listing.update(timestamp=now-7200 if stale else now, streams=[dict(listing['streams'][0], streams=events)])
    (assets / 'fixtures/streams.json').write_text(json.dumps(listing))
    return cases


def double_text(page):
    # Snapshot all computed sizes before changing any inheritance. Geometry tokens
    # stay unchanged; each element's font and line height alone double.
    page.evaluate('''() => {
      const sizes = [...document.querySelectorAll('body *')].map(el => {
        const css = getComputedStyle(el);
        return [el, parseFloat(css.fontSize), css.lineHeight];
      });
      for (const [el, size, leading] of sizes) {
        el.style.fontSize = `${size * 2}px`;
        if (leading !== 'normal') el.style.lineHeight = `${parseFloat(leading) * 2}px`;
      }
    }''')


def assert_unbroken_time(page):
    for timing in page.locator('.card-time').all():
        measurement = timing.evaluate('''el => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return {rects: range.getClientRects().length,
            height: el.getBoundingClientRect().height,
            line: parseFloat(getComputedStyle(el).lineHeight)};
        }''')
        assert measurement['rects'] == 1, (timing.inner_text(), measurement)
        assert measurement['height'] <= measurement['line'] + 1, measurement


def check(browser, origin, width, theme, density, dest, stale=False):
    with browser.new_context(viewport={'width': width, 'height': 850}, reduced_motion='reduce') as context:
        context.add_cookies([dict(name='theme', value=theme, url=origin), dict(name='density', value=density, url=origin)])
        context.add_init_script(CLS_OBSERVER)
        def route_request(route):
            if not route.request.url.startswith(origin):
                route.abort()
                return
            if route.request.resource_type == 'image':
                time.sleep(0.35)  # Deliberately late success and failed-art fallback.
            route.continue_()
        context.route('**/*', route_request)
        page = context.new_page()
        prefix = f'{width}-{theme}-{density}'
        results = []
        routes = [('home', '/'), ('category', '/c/basketball'), ('vods', '/vods'), ('empty-group', '/c/football')]
        if stale:
            routes = [('stale', '/c/basketball')]
        for label, path in routes:
            assert page.goto(origin + path, wait_until='networkidle').ok
            page.screenshot(path=str(dest / f'{prefix}-{label}.png'), full_page=True)
            cls = page.evaluate(CLS_SCORE)
            assert cls == 0, (prefix, label, cls)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (prefix, label, 'page overflow')
            cards = page.locator('a.event-card')
            for card in cards.all():
                assert card.bounding_box()['height'] >= 44
                assert card.locator('a, button').count() == 0
                name = card.locator('h1, h2, h3').inner_text()
                expect(card).to_have_accessible_name(re.compile(re.escape(name)))
                expect(card).to_have_accessible_name(re.compile('Watch'))
                fact = card.locator('.card-time, .card-state').inner_text()
                expect(card).to_have_accessible_name(re.compile(re.escape(fact)))
                # 51 anatomy: the fact owns a lane at the trailing edge; the name never enters it.
                box = card.evaluate('''el => {
                  const r = s => el.querySelector(s).getBoundingClientRect(), c = el.getBoundingClientRect();
                  const info = el.querySelector('.card-info'), pad = parseFloat(getComputedStyle(
                    el.classList.contains('card-hero') ? info : el).paddingRight);
                  const label = el.querySelector('.card-category');
                  // Only the time is heavy: every other text in the card (the plate's art aside) stays under 600.
                  const heavy = [...el.querySelectorAll('*')].filter(n => !n.closest('.card-time, .card-art')
                    && [...n.childNodes].some(t => t.nodeType === 3 && t.textContent.trim())
                    && parseInt(getComputedStyle(n).fontWeight) >= 600).map(n => n.textContent.trim());
                  return { right: c.right - pad, width: c.width, height: c.height, hero: el.classList.contains('card-hero'),
                    lane: [r('.card-lane').left, r('.card-lane').right], name: [r('.card-name').left, r('.card-name').right],
                    fact: r('.card-fact').right, art: r('.card-art').left, heavy,
                    labelTop: label.getBoundingClientRect().top, nameTop: r('.card-name').top, laneTop: r('.card-lane').top,
                    labelWhole: [...label.children].every(s => s.offsetTop === label.children[0].offsetTop)
                      && label.scrollWidth <= label.clientWidth + 1,
                    twoLineNote: [...el.querySelectorAll('.card-lane-note')].some(n => n.offsetHeight
                      && n.getBoundingClientRect().height > 1.5 * parseFloat(getComputedStyle(n).lineHeight)) };
                }''')
                assert abs(box['lane'][1] - box['right']) <= 1 and abs(box['fact'] - box['right']) <= 1, (prefix, label, box)
                assert box['name'][1] <= box['lane'][0] + 0.5, (prefix, label, 'name enters lane', box)
                assert not box['heavy'], (prefix, label, 'only the time is heavy', box['heavy'])
                # The league label is a whole line of its own above the name and the lane.
                assert box['labelTop'] < box['nameTop'] and box['labelTop'] < box['laneTop'], (prefix, label, 'label first', box)
                if len(card.locator('.card-category').inner_text()) <= len('Football · Champions League'):
                    assert box['labelWhole'], (prefix, label, 'label truncated', box)
                if not box['hero']:
                    assert box['art'] <= box['name'][0], (prefix, label, 'plate leads', box)
                    assert box['width'] / box['height'] >= 3.5, (prefix, label, 'row proportion', box)
            if label in ('category', 'stale'):
                for card in cards.all():
                    slug = card.get_attribute('href').split('/')[-1]
                    card.screenshot(path=str(dest / f'{prefix}-{label}-{slug}.png'))
                    assert card.locator('.card-art').is_visible()
                    if stale:
                        assert card.locator('.card-state').inner_text() == 'Unconfirmed'
                        assert card.get_by_role('progressbar').count() == 0
                        if slug == 'two-seeds':
                            expect(card.get_by_text('Last listed:', exact=False)).to_have_text(
                                re.compile(r'^Last listed: \d{2}:\d{2}$'))
                if not stale:
                    # The lane is reserved: a state row leaves the name exactly the column a time row does.
                    columns = {slug: page.locator(f'a.event-card[href$="/{slug}"] .card-name').bounding_box()['width']
                               for slug in ('two-seeds', 'unknown-time', 'channel', 'ended', 'live')}
                    assert max(columns.values()) - min(columns.values()) <= 0.5, (prefix, 'lane reserved', columns)
                    single = page.locator('a.event-card[href$="/no-seeds"]')
                    assert re.search(r'\b1 viewer\b(?!s)', single.inner_text()), single.inner_text()
                    expect(single).to_have_accessible_name(re.compile(r'\b1 viewer\b(?!s)'))
                    expected = {slug: 'Time unavailable' for slug in ('unknown-time', 'invalid-start')}
                    expected.update(channel='24/7', ended='Ended')
                    for slug, text in expected.items():
                        card = page.locator(f'a.event-card[href$="/{slug}"]')
                        assert text in card.inner_text(), (slug, text)
                        if text == 'Time unavailable':
                            assert card.locator('.card-time, time, [role="progressbar"]').count() == 0
                    for slug in ('invalid-end', 'missing-end'):
                        card = page.locator(f'a.event-card[href$="/{slug}"]')
                        assert card.locator('.card-time').count() == 1
                        assert 'Unconfirmed' in card.inner_text()
                        expect(card).to_have_accessible_name(re.compile('Availability unconfirmed'))
                        assert card.get_by_role('progressbar').count() == 0
                    live = page.locator('a.event-card[href$="/live"]')
                    # Below md the lane keeps one note: the status replaces the date caption.
                    assert ('Started at' in live.inner_text()) == (width >= 768), (prefix, live.inner_text())
                    assert re.search(r'\bLive\b', live.locator('.card-lane').inner_text())
                    assert live.get_by_role('progressbar').count() == 1
                    # Same checked field on hover, active, and keyboard focus.
                    for card in cards.all():
                        before = card.evaluate('(el) => getComputedStyle(el).backgroundImage')
                        card.hover()
                        page.mouse.down()
                        assert before == card.evaluate('(el) => getComputedStyle(el).backgroundImage')
                        page.mouse.move(0, 0)
                        page.mouse.up()
                        assert before == card.evaluate('(el) => getComputedStyle(el).backgroundImage')
                        page.keyboard.press("Tab")
                        card.focus()
                        page.wait_for_timeout(50)  # Allow keyboard focus styles to paint.
                        assert card.evaluate('(el) => getComputedStyle(el).outlineStyle') != 'none'
                        assert card.evaluate('(el) => parseFloat(getComputedStyle(el).outlineOffset) > 0')
                        assert before == card.evaluate('(el) => getComputedStyle(el).backgroundImage')
                    cards.first.focus()
                    page.wait_for_timeout(50)
                    page.screenshot(path=str(dest / f'{prefix}-focus.png'))
                    # Text-only 200% stress: keep the layout viewport unchanged.
                    double_text(page)
                    assert_unbroken_time(page)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (prefix, '200% overflow')
                    for timing in page.locator('.card-time, .card-state').all():
                        assert timing.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), (prefix, timing.inner_text())
                    page.evaluate('scrollTo(0, 0)')
                    page.screenshot(path=str(dest / f'{prefix}-200percent.png'), full_page=True)
            if label == 'home':
                double_text(page)
                assert_unbroken_time(page)
                page.screenshot(path=str(dest / f'{prefix}-home-200percent.png'), full_page=True)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (prefix, 'hero 200% overflow')
                for timing in page.locator('.card-time, .card-state').all():
                    assert timing.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), (prefix, timing.inner_text())
            if label == 'vods':
                assert cards.count() > 0
                assert all(card.locator('.card-state').inner_text() == 'Replay' for card in cards.all())
            results.append(dict(viewport=width, theme=theme, density=density, page=label, cls=cls, cards=cards.count()))
        return results


def check_boundaries(browser, origin, assets, dest):
    now = int(time.time())
    listing = json.loads((assets / 'fixtures/streams.json').read_text())
    event = listing['streams'][0]['streams'][0]
    event.update(starts_at=now+60, ends_at=now+120, name='Clock boundary', uri_name='basketball/boundary')
    listing.update(timestamp=now, streams=[dict(listing['streams'][0], streams=[event])])
    (assets / 'fixtures/streams.json').write_text(json.dumps(listing))
    results = []
    for width in (390, 1280):
        for theme in ('dark', 'light'):
            with browser.new_context(viewport={'width': width, 'height': 850}) as context:
                context.add_cookies([dict(name='theme', value=theme, url=origin)])
                context.add_init_script(CLS_OBSERVER)
                context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin) else route.abort())
                page = context.new_page()
                page.clock.install(time=datetime.fromtimestamp(now, timezone.utc))
                assert page.goto(origin + '/c/basketball', wait_until='networkidle').ok
                card = page.locator('a.event-card')
                kickoff = card.locator('.card-time').inner_text()
                # The lane's quiet status reads "In 1m"; the full wording is its accessible label.
                assert re.search(r'\bIn \d+m\b', card.inner_text()), card.inner_text()
                expect(card).to_have_accessible_name(re.compile('Upcoming in'))
                page.clock.fast_forward(65_000)
                assert card.locator('.card-time').inner_text() == kickoff
                assert ('Started at' in card.inner_text()) == (width >= 768), card.inner_text()
                assert card.get_by_role('progressbar').count() == 1
                assert page.evaluate(CLS_SCORE) == 0, (width, theme, 'kickoff CLS')
                page.clock.fast_forward(65_000)
                assert card.locator('.card-state').inner_text() == 'Ended'
                assert card.get_by_role('progressbar').count() == 0
                assert page.evaluate(CLS_SCORE) == 0, (width, theme, 'ended CLS')
                page.screenshot(path=str(dest / f'{width}-{theme}-boundary-ended.png'))
                results.append(dict(viewport=width, theme=theme, kickoff_cls=0, ended_cls=page.evaluate(CLS_SCORE)))
    (dest / 'boundaries.json').write_text(json.dumps(results, indent=2))


def check_known_hero(browser, origin, assets, dest):
    # Malformed inputs may win the existing home selection (ordering is 50b).
    # Separately prove a known kickoff in the retained featured allocation.
    now = int(time.time())
    listing = json.loads((assets / 'fixtures/streams.json').read_text())
    event = listing['streams'][0]['streams'][0]
    event.update(starts_at=now+7200, ends_at=now+14400, name='Known kickoff', uri_name='basketball/known-kickoff')
    listing.update(timestamp=now, streams=[dict(listing['streams'][0], streams=[event])])
    (assets / 'fixtures/streams.json').write_text(json.dumps(listing))
    results = []
    for width in (320, 390, 1280):
        for theme in ('dark', 'light'):
            for density in ('comfortable', 'compact'):
                with browser.new_context(viewport={'width': width, 'height': 850}, reduced_motion='reduce') as context:
                    context.add_cookies([dict(name='theme', value=theme, url=origin), dict(name='density', value=density, url=origin)])
                    context.add_init_script(CLS_OBSERVER)
                    page = context.new_page()
                    assert page.goto(origin, wait_until='networkidle').ok
                    hero = page.locator('.card-hero')
                    assert hero.locator('.card-time').count() == 1
                    assert page.evaluate(CLS_SCORE) == 0
                    prefix = f'{width}-{theme}-{density}'
                    page.keyboard.press('Tab')
                    hero.focus()
                    expect(hero).to_have_css('outline-color', 'rgb(115, 228, 176)' if theme == 'dark' else 'rgb(8, 99, 71)')
                    expect(hero).to_have_css('outline-offset', '2px')
                    page.screenshot(path=str(dest / f'{prefix}-hero-known-focus.png'), full_page=True)
                    double_text(page)
                    assert_unbroken_time(page)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    assert hero.locator('.card-time').evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
                    page.screenshot(path=str(dest / f'{prefix}-hero-known-200percent.png'), full_page=True)
                    results.append(dict(viewport=width, theme=theme, density=density, cls=0))
    (dest / 'hero-report.json').write_text(json.dumps(results, indent=2))


def assert_clean_banner(card, event, listing_row):
    visible = card.evaluate("""el => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const text = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.parentElement.closest('.sr-only')) text.push(node.textContent.trim());
      }
      return text.join(' ');
    }""")
    assert not re.search(r'\bUTC\b', visible), ('matched card must have no visible UTC', visible)
    for forbidden in (event['name'], event['category_name'], event.get('tag'), 'Watch'):
        if forbidden:
            assert forbidden not in visible, (forbidden, visible)
    assert card.locator('.card-info, .card-lane, .card-art, a, button').count() == 0

    match = event['match']
    scored = all(match[side]['score'] is not None for side in ('away', 'home'))
    state = {'in': 'Live', 'pre': 'Upcoming', 'post': 'Final'}[match['state']]
    detail = 'vs' if match['state'] == 'pre' and not scored else match['detail']
    label = ', '.join([
        f"{team['name']} {team['score']}" if scored else team['name']
        for team in (match['away'], match['home'])
    ] + [match['detail'] or state])
    kickoff = datetime.fromtimestamp(event['starts_at'], timezone.utc).strftime('%H:%M:%S UTC')
    expect(card).to_have_accessible_name(re.compile(
        re.escape(label) + rf".*{int(event['viewers']):,} viewers.*Kickoff .*{kickoff}"
    ))

    banner = card.locator('.match-banner')
    assert banner.locator('.banner-lineup').get_attribute('aria-hidden') == 'true'
    tiers = banner.locator('.banner-status-tier')
    assert tiers.nth(0).inner_text() == state
    assert tiers.nth(1).inner_text() == ('' if detail == state else detail)
    viewer_count = '62' if event['viewers'] == '62' else '123.5m'
    assert tiers.nth(2).inner_text() == f'{viewer_count} Viewers'
    assert banner.locator('.banner-score').all_text_contents() == (
        [str(match[side]['score']) for side in ('away', 'home')] if scored else [])
    assert banner.locator('.banner-abbreviation').all_text_contents() == [
        match[side]['abbreviation'] for side in ('away', 'home')]
    assert card.get_by_role('progressbar').count() == 1

    geometry = card.evaluate("""el => {
      const rect = r => ({left:r.left, right:r.right, top:r.top, bottom:r.bottom,
        width:r.width, height:r.height});
      const banner = el.querySelector('.match-banner');
      const nodes = [...banner.querySelectorAll('.banner-fit-text, .banner-team img')];
      return {
        card:rect(el.getBoundingClientRect()), banner:rect(banner.getBoundingClientRect()),
        radii:[getComputedStyle(el).borderRadius, getComputedStyle(banner).borderRadius],
        paint:Object.fromEntries(nodes.map(n => {
          const range = document.createRange();
          range.selectNodeContents(n);
          const logo = n.matches('img');
          const name = n.closest('.banner-team')?.className.match(/banner-(away|home)-team/)[0]
            || (n.matches('.banner-status-line') ? 'tier-' + [...n.closest('.banner-status').children].indexOf(n.parentElement)
              : n.parentElement.className.match(/banner-(away|home)-(label|score)/)[0]);
          return [name, {...rect(logo ? n.getBoundingClientRect() : range.getBoundingClientRect()),
            lines:logo ? 1 : range.getClientRects().length, font:getComputedStyle(n).fontFamily,
            weight:parseInt(getComputedStyle(n).fontWeight)}];
        })),
        progress:rect(banner.querySelector('[role=progressbar]').getBoundingClientRect())
      };
    }""")
    box, art, paint = (geometry[key] for key in ('card', 'banner', 'paint'))
    assert box == art and len(set(geometry['radii'])) == 1, geometry
    ratio = box['width'] / box['height']
    if listing_row:
        assert ratio >= 3.5 and box['height'] >= 44, geometry
    for name, ink in paint.items():
        assert ink['lines'] == 1, (name, ink)
        assert (ink['weight'] >= 600) == name.endswith('-score'), (name, ink)
        if name.endswith('-score'):
            assert 'Acumin Pro Extra Condensed' in ink['font'], ink
        assert box['left'] <= ink['left'] <= ink['right'] <= box['right'], (name, ink, box)
        assert box['top'] <= ink['top'] <= ink['bottom'] <= geometry['progress']['top'] + .25, (name, ink, box)
    for index, (name, ink) in enumerate(paint.items()):
        for other, target in list(paint.items())[index + 1:]:
            assert (ink['right'] <= target['left'] + .25 or target['right'] <= ink['left'] + .25
                    or ink['bottom'] <= target['top'] + .25 or target['bottom'] <= ink['top'] + .25), (name, other, geometry)
    top, bottom = paint['tier-0'], paint['tier-2']
    middle = paint.get('tier-1')
    if middle:
        assert top['bottom'] <= middle['top'] and middle['bottom'] <= bottom['top'], geometry
    for name in ('banner-away-score', 'banner-home-score'):
        if name in paint:
            score = paint[name]
            center = (score['top'] + score['bottom']) / 2
            assert top['bottom'] < center < bottom['top'], geometry
            if middle:
                assert middle['top'] < center < middle['bottom'], geometry
    for side in ('away', 'home'):
        team = paint[f'banner-{side}-team']
        abbrev = paint[f'banner-{side}-label']
        assert team['bottom'] <= abbrev['top'] + .25, geometry
        assert abs(abbrev['top'] - bottom['top']) <= .25, geometry
        if scored:
            score = paint[f'banner-{side}-score']
            gap = score['left'] - team['right'] if side == 'away' else team['left'] - score['right']
            assert gap >= 0, (side, gap, geometry)
    return dict(height=box['height'], width=box['width'], ratio=ratio, contrast=assert_banner_contrast(banner))


def check_matches(browser, origin, assets, dest):
    now = int(time.time())
    listing = json.loads((assets / 'fixtures/streams.json').read_text())
    template = listing['streams'][0]['streams'][0]
    away = dict(name='Colorado State Rams', abbreviation='CSU', color='#1e4d2b', logo='/icon-32.png', score=50)
    home = dict(name='Arizona Wildcats', abbreviation='Arizona', color='#cc0033', logo='/icon-48.png', score=97)
    match = dict(state='in', detail='Halftime', away=away, home=home)
    cases = [
        ('matched-live', match),
        ('matched-pre', dict(match, state='pre', detail='Scheduled', away=dict(away, score=None), home=dict(home, score=None))),
        ('matched-missing-logo', dict(match, away=dict(away, name='West Washington', logo=None))),
        ('matched-failed-logo', dict(match, away=dict(away, logo='/fixtures/missing-logo.png'))),
        ('matched-bad-color', dict(match, away=dict(away, color='url(evil)'))),
        ('matched-no-color', dict(match, away=dict(away, color=None), home=dict(home, color=None))),
        ('matched-bright', dict(match, away=dict(away, color='#ffffff'), home=dict(home, color='#ffff00'))),
        ('matched-long-status', dict(match, detail='Halftime · WWWWWWWWWWWWWWWWWWWWWWWW', away=dict(away, score=150, abbreviation='WWWWW'), home=dict(home, score=197))),
        ('matched-final', dict(match, state='post', detail='Final', away=dict(away, score=150), home=dict(home, score=197))),
    ]
    events = [dict(template, id=9000+i, match=game, name='Colorado State Rams at Arizona Wildcats', uri_name=f'basketball/{slug}', viewers='62',
                   starts_at=now-3600, ends_at=now+3600, poster='/never-fetch-provider-thumbnail.jpg') for i, (slug, game) in enumerate(cases)]
    events[-2]['viewers'] = '123456789'
    listing.update(timestamp=now, streams=[dict(listing['streams'][0], streams=events)])
    (assets / 'fixtures/streams.json').write_text(json.dumps(listing))
    results = []
    hero_results = []
    for width in (320, 390, 1280):
        for theme in ('dark', 'light'):
            for density in ('comfortable', 'compact'):
                with browser.new_context(viewport={'width': width, 'height': 850}, reduced_motion='reduce') as context:
                    context.add_cookies([dict(name='theme', value=theme, url=origin), dict(name='density', value=density, url=origin)])
                    context.route('**/fixtures/missing-logo.png', lambda route: route.fulfill(status=404, body=''))
                    requests = []
                    context.on('request', lambda req: requests.append(req.url))
                    page = context.new_page()
                    assert page.goto(origin + '/c/basketball', wait_until='networkidle').ok
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                    page.screenshot(path=str(dest / f'{width}-{theme}-{density}-matches.png'), full_page=True)
                    assert not any('never-fetch-provider' in url for url in requests), requests
                    page.evaluate('document.fonts.ready')
                    for event, (slug, _) in zip(events, cases):
                        card = page.locator(f'a.event-card[href$="/{slug}"]')
                        card.scroll_into_view_if_needed()
                        if slug in ('matched-missing-logo', 'matched-failed-logo'):
                            expect(card.locator('.banner-away-team .banner-initials')).to_have_text('WW' if slug == 'matched-missing-logo' else 'CS')
                        geometry = assert_clean_banner(card, event, listing_row=True)
                        if slug == 'matched-live':
                            progress = card.get_by_role('progressbar')
                            assert 49 <= int(progress.get_attribute('aria-valuenow')) <= 51
                            card.screenshot(path=str(dest / f'{width}-{theme}-{density}-row.png'))
                        if slug in ('matched-bad-color', 'matched-no-color'):
                            assert card.locator('.match-banner').evaluate("el => el.style.getPropertyValue('--banner-away')") == '#272624'
                        results.append(dict(viewport=width, theme=theme, density=density, fixture=slug, **geometry))
                    page.screenshot(path=str(dest / f'{width}-{theme}-{density}-matches.png'), full_page=True)
                    double_text(page)
                    # The fit pass runs from a ResizeObserver, then the transform restyles: let both settle.
                    page.evaluate('() => new Promise(resolve => { let n = 6; const tick = () => --n ? requestAnimationFrame(tick) : resolve(); tick() })')
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, density, 'matched 200%')
                    for event in (events[0], events[2], events[-2]):
                        card = page.locator(f'a.event-card[href$="/{event["uri_name"]}"]')
                        assert_clean_banner(card, event, listing_row=False)
                    hero_listing = dict(listing, streams=[dict(listing['streams'][0], streams=[events[0]])])
                    (assets / 'fixtures/streams.json').write_text(json.dumps(hero_listing))
                    assert page.goto(origin, wait_until='networkidle').ok
                    (assets / 'fixtures/streams.json').write_text(json.dumps(listing))
                    hero = page.locator('a.card-hero.card-matched')
                    expect(hero.locator('.banner-score')).to_have_count(2)
                    page.evaluate('document.fonts.ready')
                    assert page.evaluate("[...document.fonts].some(face => face.family.includes('Acumin Pro Extra Condensed') && face.status === 'loaded')")
                    geometry = assert_clean_banner(hero, events[0], listing_row=False)
                    hero_results.append(dict(viewport=width, theme=theme, density=density, **geometry))
                    hero.screenshot(path=str(dest / f'{width}-{theme}-{density}-matched-hero.png'))
    (dest / 'hero-status-report.json').write_text(json.dumps(hero_results, indent=2))
    (dest / 'match-report.json').write_text(json.dumps(results, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--screenshots', type=Path, required=True)
    parser.add_argument('--matches-only', action='store_true')
    args = parser.parse_args()
    args.screenshots.mkdir(parents=True, exist_ok=True)
    report = []
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        directory = Path(tmp)
        browser = pw.chromium.launch()
        if args.matches_only:
            with worker(directory, 'matches', args.output.resolve(), '', False) as origin:
                check_matches(browser, origin, directory / 'matches-assets', args.screenshots)
            browser.close()
            return
        for stale in (False, True):
            name = 'stale' if stale else 'fresh'
            with worker(directory, name, args.output.resolve(), '', False) as origin:
                fixtures(directory / f'{name}-assets', stale)
                if not stale:
                    (args.screenshots / 'preview-url.txt').write_text(origin)
                for width in (320, 390, 1280):
                    for theme in ('dark', 'light'):
                        for density in ('comfortable', 'compact'):
                            report.extend(check(browser, origin, width, theme, density, args.screenshots, stale))
                            print(width, theme, density, name, 'passed', flush=True)
                if not stale:
                    check_boundaries(browser, origin, directory / f'{name}-assets', args.screenshots)
                    check_known_hero(browser, origin, directory / f'{name}-assets', args.screenshots)
                    check_matches(browser, origin, directory / f'{name}-assets', args.screenshots)
        browser.close()
    (args.screenshots / 'report.json').write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
