"""50a card matrix. Run after pnpm build: python tests/cards_browser.py .output --screenshots /tmp/kwip50a-shots"""
from banner_rendered_contrast import assert_banner_contrast
import argparse
from base64 import b64encode
from datetime import datetime, timezone
import json
from math import ceil, floor
import platform
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
    for width in (320, 390, 1024, 1280):
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
    for width in (320, 390, 1024, 1280):
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


# Smallest width-to-height ratio of a listing row, measured per viewport for task 60 (docs/redesign-60.md).
# The measured three-tier rows fall below 3.5 at 320px and 390px.
# After restoring symmetric padding, the three-tier ratios are 2.6999 at 320px and 3.3561 at 390px.
RATIO_FLOOR = {320: 2.69, 390: 3.35, 1024: 3.5, 1280: 3.5}
# Cells where a detail word cannot fit the middle column at the floor and takes its row (measured).
WIDE_DETAIL = {
    (320, 'element'): {'matched-widest', 'matched-hangul-long-word'},
    (320, 'root'): {'matched-widest', 'matched-hangul-long-word'},
    (390, 'element'): {'matched-widest'},
    (390, 'root'): {'matched-widest', 'matched-hangul-long-word'},
    (1024, 'element'): {'matched-widest'},
}


def banner_geometry(card, snap_paint_baseline=False):
    return card.evaluate(r"""(el, snapPaintBaseline) => {
      const rect = r => ({left:r.left, right:r.right, top:r.top, bottom:r.bottom,
        width:r.width, height:r.height});
      const banner = el.querySelector('.match-banner');
      const lineup = banner.querySelector('.banner-lineup');
      const canvas = document.createElement('canvas').getContext('2d');
      const inkBounds = n => {
        if (!n) return null;
        const style = getComputedStyle(n);
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const text = n.firstChild;
        const range = document.createRange();
        range.selectNodeContents(text);
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        n.prepend(probe);
        const baseline = probe.getBoundingClientRect().top;
        probe.remove();
        const firstRow = [...range.getClientRects()].find(r => r.height > 0)?.top;
        const rows = new Map();
        let offset = 0;
        for (const character of text.data) {
          range.setStart(text, offset);
          range.setEnd(text, offset += character.length);
          const {top, height} = range.getBoundingClientRect();
          if (!height) continue;
          rows.set(top, (rows.get(top) || '') + character);
        }
        const translateY = new DOMMatrix(style.transform).f;
        const ink = [...rows].filter(([, content]) => content.trim()).map(([top, content]) => {
          const m = canvas.measureText(content.trim());
          let rowBaseline = baseline + top - firstRow;
          // Chromium snaps the text baseline in layout coordinates, before the CSS transform.
          if (snapPaintBaseline) rowBaseline = Math.round(rowBaseline + scrollY - translateY) - scrollY + translateY;
          return [rowBaseline - m.actualBoundingBoxAscent, rowBaseline + m.actualBoundingBoxDescent];
        });
        return [Math.min(...ink.map(row => row[0])), Math.max(...ink.map(row => row[1]))];
      };
      const nodes = [...banner.querySelectorAll('.banner-fit-text, .banner-team img')];
      const track = banner.querySelector('[role=progressbar]');
      const bounds = selector => rect(banner.querySelector(selector).getBoundingClientRect());
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
          const lineBoxes = [...range.getClientRects()];
          const breaksWord = node => node && [...node.textContent.matchAll(/\S+/g)].some(word => {
            const part = document.createRange();
            part.setStart(node, word.index);
            part.setEnd(node, word.index + word[0].length);
            return part.getClientRects().length !== 1;
          });
          return [name, {...rect(logo ? n.getBoundingClientRect() : range.getBoundingClientRect()),
            brokenWords:!logo && !n.matches('.banner-status-line') && breaksWord(n.firstChild),
            lines:logo ? 1 : new Set(lineBoxes.map(box => box.top)).size, font:getComputedStyle(n).fontFamily,
            weight:parseInt(getComputedStyle(n).fontWeight),
            mono:n.hasAttribute('data-mono'), wrap:n.hasAttribute('data-wrap'),
            scale:logo ? 1 : new DOMMatrix(getComputedStyle(n).transform).a}];
        })),
        progress:track && rect(track.getBoundingClientRect()),
        progressFill:track && track.firstElementChild.getBoundingClientRect().width,
        trackGutter:parseFloat(getComputedStyle(lineup).getPropertyValue('--banner-gutter'))
          * parseFloat(getComputedStyle(lineup).fontSize),
        // The first tier always sits in the middle column, also when detail and audience take a full row.
        middle:bounds('.banner-status-tier:first-child'),
        wideDetail:lineup.hasAttribute('data-wide-detail'),
        logoBoxes:['away', 'home'].map(side => bounds('.banner-' + side + '-team > *')),
        labels:['away', 'home'].map(side => bounds('.banner-' + side + '-label')),
        stateInk:inkBounds(banner.querySelector('.banner-status-tier:first-child .banner-status-line')),
        scoreInk:[...banner.querySelectorAll('.banner-score')].map(inkBounds),
        detailInk:inkBounds(banner.querySelector('.banner-status-tier:nth-child(2) .banner-status-line')),
        minHeight:parseFloat(getComputedStyle(banner).minHeight),
        scoreSlots:[...banner.querySelectorAll('.banner-score-slot')].map(n => rect(n.getBoundingClientRect())),
        scoreBoxes:[...banner.querySelectorAll('.banner-score')].map(n => rect(n.getBoundingClientRect())),
        tiers:[...banner.querySelectorAll('.banner-status-tier')].map(n => rect((n.firstElementChild || n).getBoundingClientRect())),
        floor:parseFloat(lineup.style.getPropertyValue('--banner-fit-floor') || getComputedStyle(lineup).getPropertyValue('--banner-fit-floor')),
        compression:parseFloat(getComputedStyle(lineup).getPropertyValue('--banner-score-compression')),
        gutter:parseFloat(lineup.hasAttribute('data-stacked')
          ? getComputedStyle(banner.querySelector('.banner-status-tier:nth-child(2)')).paddingBlockStart
          : getComputedStyle(banner.querySelector('.banner-score-slot') || lineup).paddingInlineEnd) || 0,
        statusWidth:banner.querySelector('.banner-status-tier:first-child').getBoundingClientRect().width,
        stacked:lineup.hasAttribute('data-stacked'),
        fontSize:parseFloat(getComputedStyle(lineup).fontSize),
        rootSize:parseFloat(getComputedStyle(document.documentElement).fontSize),
        scores:[...banner.querySelectorAll('.banner-score')].map(n => {
          const slot = getComputedStyle(n.parentElement);
          return {natural:n.offsetWidth + 1, room:n.parentElement.getBoundingClientRect().width - parseFloat(slot.paddingLeft) - parseFloat(slot.paddingRight)};
        })
      };
    }""", snap_paint_baseline)


def banner_measurements(geometry):
    box, paint = geometry['card'], geometry['paint']
    detail = paint.get('tier-1', paint['tier-0'])
    left, right = (paint.get(f'banner-{side}-score') for side in ('away', 'home'))
    score_gap = min(geometry['middle']['left'] - left['right'],
                    right['left'] - geometry['middle']['right']) if left else None
    # Clear space from the score row (logos, scores, state) to the detail below it.
    status_gap = paint['tier-1']['top'] - max(item['bottom'] for item in (
        *geometry['logoBoxes'], *geometry['scoreBoxes'], geometry['tiers'][0])) if 'tier-1' in paint else None
    state = geometry['tiers'][0]
    centre = lambda box: (box['top'] + box['bottom']) / 2
    ink_centre = lambda edges: sum(edges) / 2
    state_offset = (max(abs(ink_centre(geometry['stateInk']) - ink_centre(score)) for score in geometry['scoreInk'])
                    if geometry['scoreInk'] else max(abs(centre(state) - centre(logo)) for logo in geometry['logoBoxes']))
    logo_offset = max((abs(centre(logo) - centre(score)) for logo, score in
                       zip(geometry['logoBoxes'], geometry['scoreBoxes'])), default=0)
    top_gap = min(item['top'] for item in (*geometry['logoBoxes'], *geometry['scoreBoxes'], geometry['middle'])) - box['top']
    bottom_gap = box['bottom'] - max(item['bottom'] for item in (*geometry['labels'], geometry['progress'] or geometry['labels'][0]))
    detail_gap = (geometry['detailInk'][0] - max(edges[1] for edges in geometry['scoreInk'])
                  if geometry['detailInk'] and geometry['scoreInk'] else None)
    return dict(top_gap=top_gap, bottom_gap=bottom_gap, detail_ink_gap=detail_gap,
                digit_fill=min(((bottom - top) / score['height'] for (top, bottom), score in
                                zip(geometry['scoreInk'], geometry['scoreBoxes'])), default=None),
                min_height=geometry['minHeight'], height=box['height'], width=box['width'], ratio=box['width'] / box['height'],
                tiers=sum(f'tier-{index}' in paint for index in range(3)), wide_detail=geometry['wideDetail'],
                status_width=geometry['statusWidth'], detail_lines=detail['lines'],
                abbreviation_lines=max(paint[f'banner-{side}-label']['lines'] for side in ('away', 'home')),
                monospace=[name for name, ink in paint.items() if ink['mono']],
                broken_words=sum(bool(ink['brokenWords']) for ink in paint.values()),
                overflow=max(0, *(max(box['left'] - ink['left'], ink['right'] - box['right'])
                                  for ink in paint.values())),
                tier_clearance=min(detail['top'] - paint['tier-0']['bottom'],
                                   paint['tier-2']['top'] - detail['bottom']) if 'tier-1' in paint and 'tier-2' in paint else None,
                min_scale=min(ink['scale'] for name, ink in paint.items() if not name.endswith('-team')),
                gutter=geometry['gutter'], score_gap=score_gap, status_gap=status_gap,
                state_offset=state_offset, logo_offset=logo_offset,
                stacked=geometry['stacked'])


def assert_hero_dead_band(hero, listing, fixture):
    assert hero['digit_fill'] >= .6, ('hero digit fill below 60%', fixture, hero['digit_fill'])
    if listing:
        assert hero['detail_ink_gap'] <= 1.6 * listing['detail_ink_gap'], (
            'hero digit-to-detail dead band', fixture, hero['detail_ink_gap'], listing['detail_ink_gap'])


def assert_rendered_segments(oracle, card, sources, fixture, granularity='grapheme'):
    tiers = card.locator('.banner-status-tier')
    actual = tiers.all_text_contents()
    assert actual == list(sources), ('status text changed', fixture, sources, actual)
    segments = oracle.evaluate("""({sources, granularity}) => {
      const segmenter = new Intl.Segmenter(undefined, {granularity});
      return sources.map((source, tier) => Array.from(segmenter.segment(
        granularity === 'word' && tier !== 1 ? '' : source
      )).flatMap(({index, segment, isWordLike}) =>
        (granularity === 'word' ? isWordLike : segment.trim()) ? [[index, index + segment.length]] : []
      ));
    }""", dict(sources=list(sources), granularity=granularity))
    invalid = tiers.evaluate_all("""(tiers, segments) => tiers.flatMap((tier, index) => {
      const walker = document.createTreeWalker(tier, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let offset = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        nodes.push({node, offset});
        offset += node.length;
      }
      return segments[index].flatMap(([start, end]) => {
        const first = nodes.find(({node, offset}) => start < offset + node.length);
        const last = nodes.find(({node, offset}) => end <= offset + node.length);
        const range = document.createRange();
        range.setStart(first.node, start - first.offset);
        range.setEnd(last.node, end - last.offset);
        const count = range.getClientRects().length;
        return count === 1 ? [] : [[index, start, end, count]];
      });
    })""", segments)
    assert not invalid, (f'rendered {granularity} rect count', fixture, invalid)


def status_sources(event):
    match = event['match']
    state = {'in': 'Live', 'pre': 'Upcoming', 'post': 'Final'}[match['state']]
    scored = all(match[side]['score'] is not None for side in ('away', 'home'))
    detail = 'vs' if match['state'] == 'pre' and not scored else match['detail']
    viewers = int(event['viewers'])
    compact = '62' if viewers == 62 else '123.5m'
    audience = f'{compact} {"Viewer" if viewers == 1 else "Viewers"}'
    return state, '' if detail == state else detail, audience


def assert_clean_banner(card, event, oracle, listing_row, allow_growth=False, root_text=False):
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
    state, detail, audience = status_sources(event)
    viewers = int(event['viewers'])
    compact = audience.split()[0]
    # The name is the banner's own content, in its words and order, one sentence each.
    teams = (', '.join(f"{match[side]['name']} {match[side]['score']}" for side in ('away', 'home')) if scored
             else f"{match['away']['name']} vs {match['home']['name']}")
    spoken = audience if compact == f'{viewers:,}' else f'{audience} ({viewers:,})'
    parts = [teams, state, '' if detail in ('vs', state) else detail, spoken]
    kickoff = datetime.fromtimestamp(event['starts_at'], timezone.utc).strftime('%a, %d %b %Y %H:%M:%S UTC')
    expected = '. '.join(part for part in parts if part) + ('. 24/7.' if event.get('always_live') == 1 else f'. Kickoff {kickoff}.')
    expect(card).to_have_accessible_name(re.compile(f'^{re.escape(expected)}$'))
    # The progress bar is decoration here: it must neither be exposed nor leak its value into the name.
    assert card.get_by_role('progressbar').count() == 0
    has_window = event.get('always_live') != 1 and 0 < event['starts_at'] < event['ends_at']
    assert card.locator('[role=progressbar]').count() == int(has_window)

    banner = card.locator('.match-banner')
    assert banner.locator('.banner-lineup').get_attribute('aria-hidden') == 'true'
    assert_rendered_segments(oracle, card, (state, detail, audience), event['uri_name'])
    assert banner.locator('.banner-score').all_text_contents() == (
        [str(match[side]['score']) for side in ('away', 'home')] if scored else [])
    # Never blank under a logo: an empty abbreviation falls back to the name's initials.
    shown = banner.locator('.banner-abbreviation').all_text_contents()
    assert shown == [match[side]['abbreviation'] or ''.join(word[0] for word in match[side]['name'].split()[:3]).upper()
                     for side in ('away', 'home')], shown
    assert all(text.strip() for text in shown), shown

    geometry = banner_geometry(card)
    box, art, paint = (geometry[key] for key in ('card', 'banner', 'paint'))
    assert box == art and len(set(geometry['radii'])) == 1, geometry
    measurements = assert_scoreboard_layout(geometry, event['uri_name'], bool(detail))
    if listing_row:
        assert box['height'] >= 44, geometry
        if not allow_growth:
            floor_ratio = RATIO_FLOOR[card.page.viewport_size['width']]
            assert box['width'] / box['height'] >= floor_ratio, ('ratio below floor', event['uri_name'], floor_ratio, geometry)
    floor = geometry['floor']
    assert floor == .6, geometry
    for name, ink in paint.items():
        assert not ink['brokenWords'], ('word breaks across lines', name, ink)
        if name.endswith('-label'):
            assert ink['lines'] == 1, ('abbreviation wraps', name, ink)
        # One line, unless the line hit the fit floor and wrapped: then the row grows instead of the text shrinking.
        assert ink['lines'] == 1 or ink['wrap'], (name, ink)
        assert not ink['wrap'] or not name.endswith('-score'), (name, ink)
        if not name.endswith('-team'):  # initials live in a fixed logo box
            assert ink['scale'] >= floor - .002, ('drawn below the fit floor', name, ink['scale'], floor)
        assert (ink['weight'] >= 600) == name.endswith('-score'), (name, ink)
        if name.endswith('-score'):
            assert 'Acumin Pro Extra Condensed' in ink['font'], ink
        assert box['left'] <= ink['left'] <= ink['right'] <= box['right'], (event['uri_name'], name, ink, geometry)
        assert box['top'] <= ink['top'] <= ink['bottom'] <= box['bottom'], (event['uri_name'], name, ink, geometry)
    # No tolerance: ink boxes of two items never overlap, in either direction.
    for index, (name, ink) in enumerate(paint.items()):
        for other, target in list(paint.items())[index + 1:]:
            assert (ink['right'] <= target['left'] or target['right'] <= ink['left']
                    or ink['bottom'] <= target['top'] or target['bottom'] <= ink['top']), (name, other, geometry)
    if root_text:
        # 27ba445's 320px Halftime row was 145px. Allow the score row plus the detail and audience tiers,
        # including a multi-line detail, within a bounded number of metadata line heights.
        assert geometry['rootSize'] == 32 and geometry['fontSize'] == 26, geometry
        lines = paint['tier-1']['lines'] if 'tier-1' in paint else 1
        # Only the fixtures wider than the feed allows may wrap further; the height bound still holds.
        assert lines <= 3 or allow_growth, geometry
        assert box['height'] <= 145.2 + (4 + (lines - 1) * 1.3) * geometry['fontSize'], (
            'disproportionate root-text row', geometry)
        if event['match']['detail'] == 'Halftime':
            assert paint['tier-1']['lines'] == 1, geometry
    if listing_row and card.page.viewport_size['width'] == 1024 and event['uri_name'].endswith('/matched-long-status'):
        assert paint['tier-1']['lines'] == 1, ('1024px detail wraps', geometry)
    scores = geometry['scores']
    if scored:
        # Both scores are fitted together, so 50/97 and 101/99 are drawn at the same scale, and the scale
        # only drops below the compression when the column is genuinely too tight for the wider score.
        widest = max(score['natural'] for score in scores)
        expected = max(floor, min(geometry['compression'], *(score['room'] / widest for score in scores)))
        drawn = [paint[f'banner-{side}-score']['scale'] for side in ('away', 'home')]
        assert abs(drawn[0] - drawn[1]) < .001 and abs(drawn[0] - expected) < .01, (drawn, expected, scores)
        if all(score['room'] >= widest * geometry['compression'] for score in scores):
            assert abs(drawn[0] - geometry['compression']) < .001, ('squeezed with room to spare', drawn, scores)
    if scored and listing_row and not allow_growth and box['width'] >= 600:
        # Wide listing card: scores sit near the mockup's 38.5% and 57.6% of the width, not out at the edges.
        centres = [((paint[f'banner-{side}-score']['left'] + paint[f'banner-{side}-score']['right']) / 2 - box['left']) / box['width'] * 100
                   for side in ('away', 'home')]
        assert abs(centres[0] - 38.5) <= 3 and abs(centres[1] - 57.6) <= 4, ('score centres', event['uri_name'], centres)
    return dict(**measurements, **assert_banner_contrast(banner))



def assert_scoreboard_layout(geometry, fixture, has_detail):
    box, paint = geometry['card'], geometry['paint']
    middle = geometry['middle']
    state, detail, audience = geometry['tiers']
    labels = geometry['labels']
    measurements = banner_measurements(geometry)
    assert abs(measurements['top_gap'] - measurements['bottom_gap']) <= 2, (
        'score row padding symmetry', fixture, measurements['top_gap'], measurements['bottom_gap'])
    # Logos share the score box centre. The state aligns with the visible score glyphs.
    assert measurements['logo_offset'] <= 1, ('logo centre offset', fixture, measurements['logo_offset'])
    assert measurements['state_offset'] <= 1, ('state ink centre offset', fixture, measurements['state_offset'])
    score_row = max(item['bottom'] for item in (*geometry['logoBoxes'], *geometry['scoreBoxes'], state))
    assert score_row <= detail['top'], ('detail below scores', fixture, geometry)
    assert detail['bottom'] <= audience['top'] and audience['bottom'] <= min(label['top'] for label in labels), (
        'audience between detail and bottom row', fixture, geometry)
    # 0.02px: a wrapped tier is laid out at 100% / floor and drawn at the floor, which rounds.
    assert box['left'] <= middle['left'] <= state['left'] + .02 and state['right'] <= middle['right'] + .02 <= box['right'] + .02, (
        'state outside middle column', fixture, state, middle, box)
    axis = (middle['left'] + middle['right']) / 2
    for tier in (detail, audience):
        if geometry['wideDetail']:
            # Only a word too wide for the middle column takes the row, and it stays centred on that column.
            assert geometry['stacked'], ('wide detail outside the compact layout', fixture, geometry)
            assert box['left'] <= tier['left'] <= tier['right'] <= box['right'], ('tier outside card', fixture, tier, box)
            assert tier['width'] == 0 or abs((tier['left'] + tier['right']) / 2 - axis) <= 1, (
                'wide tier off the middle axis', fixture, tier, middle)
        else:
            assert middle['left'] <= tier['left'] + .02 and tier['right'] <= middle['right'] + .02, (
                'tier outside middle column', fixture, tier, middle, box)
    for tier in geometry['tiers']:
        assert box['top'] <= tier['top'] <= tier['bottom'] <= box['bottom'], (fixture, tier, box)
    for side, index in (('away', 0), ('home', 1)):
        logo = geometry['logoBoxes'][index]
        assert logo['bottom'] <= labels[index]['top'], ('logo above abbreviation', fixture, side, geometry)
        if paint.get(f'banner-{side}-score'):
            score = paint[f'banner-{side}-score']
            team = paint[f'banner-{side}-team']
            gap = score['left'] - team['right'] if side == 'away' else team['left'] - score['right']
            assert gap >= 0, ('score touches logo', fixture, side, gap, geometry)
    if progress := geometry['progress']:
        # A visible track in the bottom row, between the abbreviations, above the card's edge.
        assert progress['height'] >= 4 and progress['width'] >= progress['height'] * 4, (fixture, progress)
        assert labels[0]['right'] < progress['left'] < progress['right'] < labels[1]['left'], (fixture, progress, labels)
        if geometry['stacked']:
            left, right = middle['left'], middle['right']
        elif slots := geometry['scoreSlots']:
            left, right = slots[0]['left'], slots[1]['right']
        else:
            # Without scores, the unstacked abbreviation slots still border the score tracks.
            left, right = labels[0]['right'], labels[1]['left']
        inset = geometry['trackGutter']
        assert abs(progress['left'] - (left + inset)) <= 1 and abs(progress['right'] - (right - inset)) <= 1, (
            'track span', fixture, progress, left, right, inset)
        for label in labels:
            assert abs((label['top'] + label['bottom']) - (progress['top'] + progress['bottom'])) <= 2, (
                'track off the bottom row centre', fixture, progress, label)
        assert box['left'] < progress['left'] and progress['right'] < box['right'] and progress['bottom'] < box['bottom'], (
            fixture, progress, box)
        for name, ink in paint.items():
            assert (ink['right'] <= progress['left'] or progress['right'] <= ink['left']
                    or ink['bottom'] <= progress['top'] or progress['bottom'] <= ink['top']), (
                'track overlaps text', fixture, name, ink, progress)
    # Keep the intended minimum even if a stylesheet regression removes the padding.
    gutter = max(geometry['fontSize'] * .5, geometry['gutter'])
    if measurements['score_gap'] is not None:
        assert measurements['score_gap'] >= gutter - .02, (
            'score-to-middle gap below gutter', fixture, measurements['score_gap'], gutter)
    if geometry['stacked'] and has_detail:
        assert measurements['status_gap'] >= gutter - .02, (
            'score-to-detail gap below gutter', fixture, measurements['status_gap'], gutter)
    return measurements

def check_next_up(browser, origin, assets, dest, listing, events, oracle):
    """The single-column Next up row (1232px wide at 1280) takes the same scoreboard grid."""
    hero = next(event for event in events if event['uri_name'].endswith('/matched-live'))
    upcoming = next(event for event in events if event['uri_name'].endswith('/matched-pre'))
    (assets / 'fixtures/streams.json').write_text(json.dumps(dict(listing, streams=[dict(listing['streams'][0], streams=[hero, upcoming])])))
    results = []
    for width in (320, 390, 1024, 1280):
        with browser.new_context(viewport={'width': width, 'height': 850}, reduced_motion='reduce') as context:
            page = context.new_page()
            for mode in ('normal', 'root'):
                assert page.goto(origin, wait_until='networkidle').ok
                page.evaluate('document.fonts.ready')
                if mode == 'root':
                    page.evaluate("document.documentElement.style.setProperty('font-size', '200%', 'important')")
                settle_fit(page)
                section = page.get_by_role('region', name='Next up')
                card = section.locator(f'a.event-card[href$="/{upcoming["uri_name"].rsplit("/", 1)[1]}"]')
                expect(card).to_have_count(1)
                card.scroll_into_view_if_needed()
                geometry = assert_clean_banner(card, upcoming, oracle, listing_row=mode == 'normal', root_text=mode == 'root')
                assert card.evaluate('el => el.scrollWidth === el.clientWidth && el.getBoundingClientRect().right <= innerWidth')
                results.append(dict(viewport=width, mode=mode, **geometry))
                if mode == 'normal':
                    card.screenshot(path=str(dest / f'{width}-next-up-row.png'))
    (assets / 'fixtures/streams.json').write_text(json.dumps(listing))
    (dest / 'next-up-report.json').write_text(json.dumps(results, indent=2))
    print('Next up rows: ' + ', '.join(f"{x['viewport']}px {x['mode']} {x['width']:.0f}x{x['height']:.0f}" for x in results), flush=True)


def check_stale_matches(browser, origin, assets, dest, listing, events, measure_only):
    """A stale feed drops the audience and the timeline; the layout and order still hold."""
    picks = [event for event in events if event['uri_name'].rsplit('/', 1)[1] in ('matched-live', 'matched-pre', 'matched-final')]
    expected_tiers = {'matched-live': 2, 'matched-pre': 2, 'matched-final': 1}
    stale_listing = dict(listing, timestamp=listing['timestamp'] - 7200, streams=[dict(listing['streams'][0], streams=picks)])
    (assets / 'fixtures/streams.json').write_text(json.dumps(stale_listing))
    results = []
    for width in (320, 390, 1024, 1280):
        with browser.new_context(viewport={'width': width, 'height': 850}, reduced_motion='reduce') as context:
            page = context.new_page()
            for mode in ('normal', 'root'):
                assert page.goto(origin + '/c/basketball', wait_until='networkidle').ok
                page.evaluate('document.fonts.ready')
                if mode == 'root':
                    page.evaluate("document.documentElement.style.setProperty('font-size', '200%', 'important')")
                settle_fit(page)
                for event in picks:
                    slug = event['uri_name'].rsplit('/', 1)[1]
                    card = page.locator(f'a.event-card[href$="/{slug}"]')
                    geometry = banner_geometry(card)
                    if measure_only:
                        measurements = banner_measurements(geometry)
                    else:
                        assert card.locator('[role=progressbar]').count() == 0, ('stale timeline', width, mode, slug)
                        measurements = assert_scoreboard_layout(geometry, (slug, 'stale', width, mode), slug != 'matched-final')
                        assert measurements['tiers'] == expected_tiers[slug], (slug, measurements)
                        if mode == 'normal':
                            assert measurements['ratio'] >= RATIO_FLOOR[width], ('stale ratio below floor', width, slug, measurements)
                    results.append(dict(viewport=width, fixture=slug, mode=mode, stale=True, **measurements))
    (assets / 'fixtures/streams.json').write_text(json.dumps(listing))
    (dest / 'stale-match-report.json').write_text(json.dumps(results, indent=2))
    print('Stale matched cards: no timeline, layout holds', flush=True)


def collect_render_errors(page, errors):
    page.on('console', lambda message: errors.append(message.text)
            if message.type in ('error', 'warning') and 'hydrat' in message.text.lower() else None)
    page.on('pageerror', lambda error: errors.append(str(error)))


def settle_fit(page):
    page.evaluate('() => new Promise(resolve => { let n = 6; const tick = () => --n ? requestAnimationFrame(tick) : resolve(); tick() })')


def check_codepoint_control(oracle, page, events):
    page.locator('.banner-status-line').evaluate_all("""lines => {
      for (const line of lines) {
        line.replaceChildren(...Array.from(line.textContent, point => {
          const span = document.createElement('span');
          span.style.display = 'inline-block';
          span.style.whiteSpace = 'nowrap';
          span.textContent = point;
          return span;
        }));
      }
    }""")
    failures = {}
    for event in events:
        slug = event['uri_name']
        card = page.locator(f'a.event-card[href$="/{slug}"]')
        try:
            assert_rendered_segments(oracle, card, status_sources(event), slug)
        except AssertionError as error:
            reason, fixture, offsets = error.args[0]
            assert reason == 'rendered grapheme rect count', error
            failures[fixture] = offsets
    for slug in ('thai-sara-am', 'hangul-jamo', 'hangul-trailing', 'khmer', 'mixed'):
        assert f'basketball/matched-{slug}' in failures, ('code-point control stayed green', slug, failures)
    print(f'Code-point control failures (tier, UTF-16 start, end, rect count): {failures}', flush=True)


def check_matches(browser, origin, assets, dest, text_modes, measure_only=False):
    now = int(time.time())
    listing = json.loads((assets / 'fixtures/streams.json').read_text())
    template = listing['streams'][0]['streams'][0]
    away = dict(name='Colorado State Rams', abbreviation='CSU', color='#1e4d2b', logo='/icon-32.png', score=50)
    # The feed caps abbreviations at five characters, so ARIZ is what real data produces.
    home = dict(name='Arizona Wildcats', abbreviation='ARIZ', color='#cc0033', logo='/icon-48.png', score=97)
    match = dict(state='in', detail='Halftime', away=away, home=home)
    cases = [
        ('matched-live', match),
        ('matched-pre', dict(match, state='pre', detail='Scheduled', away=dict(away, score=None), home=dict(home, score=None))),
        ('matched-missing-logo', dict(match, away=dict(away, name='West Washington', logo=None))),
        ('matched-failed-logo', dict(match, away=dict(away, logo='/fixtures/missing-logo.png'))),
        ('matched-bad-color', dict(match, away=dict(away, color='url(evil)'))),
        ('matched-no-color', dict(match, away=dict(away, color=None), home=dict(home, color=None))),
        ('matched-bright', dict(match, away=dict(away, color='#ffffff'), home=dict(home, color='#ffff00'))),
        ('matched-three-digit', dict(match, away=dict(away, score=101), home=dict(home, score=99))),
        # The feed's maximum: a 24-character detail and five-character abbreviations.
        ('matched-long-status', dict(match, detail='End of 4th Quarter - OT1', away=dict(away, score=999, abbreviation='WWWWW'), home=dict(home, score=999, abbreviation='MMMMM'))),
        # Nothing may be left blank under a logo.
        ('matched-empty-abbr', dict(match, away=dict(away, abbreviation=''), home=dict(home, abbreviation=''))),
        ('matched-final', dict(match, state='post', detail='Final', away=dict(away, score=150), home=dict(home, score=197))),
        # Wider than the feed allows on purpose: the row may grow, the text may not shrink or collide.
        ('matched-widest', dict(match, detail='W' * 24, away=dict(away, score=148, abbreviation='WWWWW'), home=dict(home, score=152, abbreviation='WWWWW'))),
        ('matched-cjk', dict(match, detail='漢' * 24, away=dict(away, score=999, abbreviation='WWWWW'), home=dict(home, score=999, abbreviation='WWWWW'))),
        ('matched-thai', dict(match, detail='ครึ่งหลังต่อเวลาพิเศษ')),
        ('matched-katakana', dict(match, detail='クォーター延長')),
        ('matched-lao', dict(match, detail='ກຳລັງແຂ່ງຂັນ')),
        ('matched-devanagari', dict(match, detail='दूसरा हाफ़')),
        ('matched-arabic', dict(match, detail='الشوط الثاني')),
        ('matched-hangul-jamo', dict(match, detail='후반전')),
        ('matched-hangul-long-word', dict(match, detail='후반전연장전승부차기진행중')),
        ('matched-hangul-trailing', dict(match, detail='훅')),
        ('matched-khmer', dict(match, detail='ក្រ')),
        ('matched-mixed', dict(match, detail='OT กำลัง 후반')),
        ('matched-emoji', dict(match, detail='延長👩🏽‍⚽🇹🇭')),
        # No usable window: no timeline, and the card keeps the height of one that has it.
        ('matched-always-live', match),
    ]
    growth_fixtures = {'matched-widest', 'matched-cjk'}
    events = [dict(template, id=9000+i, match=game, name='Colorado State Rams at Arizona Wildcats', uri_name=f'basketball/{slug}', viewers='62',
                   starts_at=now-3600, ends_at=now+3600, poster='/never-fetch-provider-thumbnail.jpg') for i, (slug, game) in enumerate(cases)]
    for event in events:
        if event['uri_name'].endswith('matched-pre'):
            event.update(starts_at=now+3600, ends_at=now+7200)
        if event['uri_name'].endswith('matched-final'):
            event['viewers'] = '123456789'
        if event['uri_name'].endswith('matched-always-live'):
            event['always_live'] = 1
    listing.update(timestamp=now, streams=[dict(listing['streams'][0], streams=events)])
    (assets / 'fixtures/streams.json').write_text(json.dumps(listing))
    # Keep the oracle in a separate, unmodified Chromium page, including for SSR.
    oracle = browser.new_page() if not measure_only else None
    hydration_errors = []
    if oracle:
        # Keep the established geometry fixture and probe the longer SARA AM detail separately.
        thai_detail = 'กำลังแข่งขัน น้ำท่วมสนาม'
        thai_event = dict(events[0], id=9100, uri_name='basketball/matched-thai-sara-am',
                          match=dict(match, detail=thai_detail))
        word_probes = [
            thai_event,
            dict(thai_event, id=9101, uri_name='basketball/matched-khmer-words',
                 match=dict(match, detail='ពាក់កណ្ដាលទីពីរ ការប្រកួតបន្ថែមម៉ោង')),
            dict(thai_event, id=9102, uri_name='basketball/matched-hangul-spaced',
                 match=dict(match, detail='후반전 연장전 훅')),
        ]
        oracle_events = [*word_probes, *events]
        oracle_listing = dict(listing, streams=[dict(listing['streams'][0], streams=oracle_events)])
        (assets / 'fixtures/streams.json').write_text(json.dumps(oracle_listing))
        for render in ('SSR', 'fallback', 'hydrated'):
            for width in (320, 390, 1024, 1280):
                with browser.new_context(viewport={'width': width, 'height': 850},
                                         device_scale_factor=3, java_script_enabled=render != 'SSR') as context:
                    if render == 'fallback':
                        context.add_init_script('delete Intl.Segmenter')
                    page = context.new_page()
                    collect_render_errors(page, hydration_errors)
                    assert page.goto(origin + '/c/basketball', wait_until='networkidle').ok
                    page.evaluate('document.fonts.ready')
                    for mode in ('normal', 'root'):
                        if mode == 'root':
                            page.evaluate("document.documentElement.style.setProperty('font-size', '200%', 'important')")
                            assert page.evaluate('getComputedStyle(document.documentElement).fontSize') == '32px'
                            if render != 'SSR':
                                settle_fit(page)
                        for event in oracle_events:
                            slug = event['uri_name']
                            card = page.locator(f'a.event-card[href$="/{slug}"]')
                            if render != 'SSR':
                                expect(card.locator('.banner-lineup')).to_have_attribute('style', re.compile('--banner-lineup-min'))
                            sources = status_sources(event)
                            cell = (slug, render, width, mode)
                            assert_rendered_segments(oracle, card, sources, cell)
                            if any(script in slug for script in ('hangul', 'mixed', 'thai', 'khmer')):
                                assert_rendered_segments(oracle, card, sources, cell, 'word')
                            if event is thai_event and (render, width, mode) == ('SSR', 320, 'normal'):
                                card.locator('.banner-status-tier').nth(1).screenshot(path=str(dest / 'thai-first-paint-3x.png'))
                    if (render, width) == ('hydrated', 320):
                        check_codepoint_control(oracle, page, oracle_events)
        print('Rendered graphemes and Hangul, Thai and Khmer words passed at 3× in SSR, fallback and hydrated renders', flush=True)
        (assets / 'fixtures/streams.json').write_text(json.dumps(listing))
    results = []
    hero_results = []
    for width in (320, 390, 1024, 1280):
        for theme in ('dark', 'light'):
            for density in ('comfortable', 'compact'):
                listing_rows = {}
                with browser.new_context(viewport={'width': width, 'height': 850}, reduced_motion='reduce') as context:
                    context.add_cookies([dict(name='theme', value=theme, url=origin), dict(name='density', value=density, url=origin)])
                    context.route('**/fixtures/missing-logo.png', lambda route: route.fulfill(status=404, body=''))
                    requests = []
                    context.on('request', lambda req: requests.append(req.url))
                    page = context.new_page()
                    if not measure_only:
                        collect_render_errors(page, hydration_errors)
                    prefix = f'{width}-{theme}-{density}'
                    for mode in text_modes:
                        assert page.goto(origin + '/c/basketball', wait_until='networkidle').ok
                        page.evaluate('document.fonts.ready')
                        if mode == 'root':
                            page.evaluate("document.documentElement.style.setProperty('font-size', '200%', 'important')")
                        elif mode == 'element':
                            double_text(page)
                        # Let ResizeObserver and the fit pass settle after changing font sizes.
                        settle_fit(page)
                        if not measure_only and mode != 'root':
                            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (prefix, mode, 'page overflow')
                        for event, (slug, _) in zip(events, cases):
                            card = page.locator(f'a.event-card[href$="/{slug}"]')
                            card.scroll_into_view_if_needed()
                            if mode == 'root' and not measure_only:
                                assert card.evaluate('''el => {
                                    const {left, right} = el.getBoundingClientRect();
                                    return left >= 0 && right <= innerWidth;
                                }'''), (prefix, slug)
                            if measure_only:
                                geometry = banner_measurements(banner_geometry(card))
                            else:
                                if slug in ('matched-missing-logo', 'matched-failed-logo'):
                                    expect(card.locator('.banner-away-team .banner-initials')).to_have_text('WW' if slug == 'matched-missing-logo' else 'CS')
                                geometry = assert_clean_banner(card, event, oracle, listing_row=mode == 'normal',
                                                               allow_growth=slug in growth_fixtures, root_text=mode == 'root')
                                mono = ['tier-1'] if slug == 'matched-widest' and width in (320, 390) and mode != 'normal' else []
                                assert geometry['monospace'] == mono, ('unexpected monospace', prefix, mode, slug, geometry)
                                wide = WIDE_DETAIL.get((width, mode), set())
                                assert geometry['wide_detail'] == (slug in wide), ('unexpected wide detail', prefix, mode, slug, geometry)
                                if slug == 'matched-cjk' and width == 320 and mode == 'root':
                                    assert geometry['detail_lines'] > 1, ('Han detail did not wrap', prefix, geometry)
                                if width == 1024:
                                    assert geometry['stacked'] == (slug == 'matched-widest' and mode == 'element'), (
                                        'unexpected 1024px stacking', prefix, mode, slug, geometry)
                                if (width == 1280
                                        or (mode == 'normal' and width in (320, 390) and slug not in growth_fixtures)
                                        or (mode == 'root' and width == 390 and slug == 'matched-live')):
                                    assert not geometry['stacked'], ('unexpected stacking', prefix, mode, slug)
                                if slug == 'matched-always-live':
                                    assert card.locator('[role=progressbar]').count() == 0
                                    live = page.locator('a.event-card[href$="/matched-live"]').bounding_box()['height']
                                    assert abs(geometry['height'] - live) < .02, ('timeline absence changed height', prefix, mode, geometry['height'], live)
                                if slug in ('matched-live', 'matched-pre', 'matched-final'):
                                    progress = card.locator('[role=progressbar]')
                                    expected = max(0, 100 * (time.time() - event['starts_at']) / (
                                        event['ends_at'] - event['starts_at']))
                                    actual = progress.evaluate("""el => ({
                                      value: Number(el.getAttribute('aria-valuenow')),
                                      fill: 100 * el.firstElementChild.getBoundingClientRect().width /
                                        el.getBoundingClientRect().width
                                    })""")
                                    assert all(abs(value - expected) <= 1 for value in actual.values()), (
                                        'progress and fill width', prefix, actual, expected)
                                    if mode == 'normal' and slug == 'matched-live':
                                        card.screenshot(path=str(dest / f'{prefix}-row.png'))
                                if slug in ('matched-bad-color', 'matched-no-color'):
                                    assert card.locator('.match-banner').evaluate("el => el.style.getPropertyValue('--banner-away')") == '#272624'
                            if slug == 'matched-live':
                                listing_rows[mode] = geometry
                            results.append(dict(viewport=width, theme=theme, density=density, fixture=slug, mode=mode, **geometry))
                        if not measure_only:
                            page.screenshot(path=str(dest / f'{prefix}-{mode}-matches.png'), full_page=True)
                    if not measure_only and 'normal' in text_modes:
                        assert not any('never-fetch-provider' in url for url in requests), requests
                        for event in (events[0], events[-1]):
                            hero_listing = dict(listing, streams=[dict(listing['streams'][0], streams=[event])])
                            (assets / 'fixtures/streams.json').write_text(json.dumps(hero_listing))
                            assert page.goto(origin, wait_until='networkidle').ok
                            (assets / 'fixtures/streams.json').write_text(json.dumps(listing))
                            hero = page.locator('a.card-hero.card-matched')
                            expect(hero.locator('.banner-score')).to_have_count(2)
                            page.evaluate('document.fonts.ready')
                            featured = page.get_by_role('region', name='Featured event')
                            expect(featured.locator('.hero-player')).to_have_count(0)
                            for mode in ('normal', 'root'):
                                if mode == 'root':
                                    page.evaluate("document.documentElement.style.setProperty('font-size', '200%', 'important')")
                                settle_fit(page)
                                geometry = assert_clean_banner(hero, event, oracle, listing_row=False)
                                assert_hero_dead_band(geometry, listing_rows.get(mode), (prefix, mode, event['uri_name']))
                                assert hero.evaluate('el => el.getBoundingClientRect().right <= innerWidth')
                                assert featured.bounding_box()['height'] == hero.bounding_box()['height']
                                hero_results.append(dict(viewport=width, theme=theme, density=density,
                                                         mode=mode, fixture=event['uri_name'], **geometry))
                                if mode == 'normal' and event is events[0]:
                                    hero.screenshot(path=str(dest / f'{prefix}-matched-hero.png'))
                print(prefix, '/'.join(text_modes), flush=True)
    print(f'Hydration and uncaught page errors: {len(hydration_errors)}', flush=True)
    assert not hydration_errors, hydration_errors
    check_stale_matches(browser, origin, assets, dest, listing, events, measure_only)
    if oracle:
        check_next_up(browser, origin, assets, dest, listing, events, oracle)
        oracle.close()
    (dest / 'hero-status-report.json').write_text(json.dumps(hero_results, indent=2))
    (dest / 'match-report.json').write_text(json.dumps(results, indent=2))


def screenshot_ink(line, dpr):
    """Decode the element's painted pixels on the device grid, including ink outside its line box."""
    page = line.page
    line.evaluate("el => el.setAttribute('data-ink-target', '')")
    try:
        box = line.bounding_box()
        left = max(0, floor(box['x']) - 2)
        top = max(0, floor(box['y']) - 8)
        right = ceil(box['x'] + box['width']) + 2
        bottom = ceil(box['y'] + box['height']) + 8
        image = page.screenshot(
            clip=dict(x=left, y=top, width=right - left, height=bottom - top),
            style="""
              .match-banner { background: black !important }
              .match-banner * { visibility: hidden !important }
              .match-banner [data-ink-target] { visibility: visible !important; color: white !important }
            """,
        )
    finally:
        line.evaluate("el => el.removeAttribute('data-ink-target')")
    bounds = page.evaluate("""async png => {
      const bytes = Uint8Array.from(atob(png), value => value.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], {type: 'image/png'}));
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      image.close();
      const {data} = context.getImageData(0, 0, canvas.width, canvas.height);
      const rows = [];
      for (let y = 0; y < canvas.height; y++) {
        const end = (y + 1) * canvas.width * 4;
        for (let i = y * canvas.width * 4; i < end; i += 4) {
          if (Math.min(data[i], data[i + 1], data[i + 2]) >= 128) {
            rows.push(y);
            break;
          }
        }
      }
      return rows.length ? [rows[0], rows.at(-1) + 1] : null;
    }""", b64encode(image).decode('ascii'))
    assert bounds, ('no screenshot ink', line.inner_text(), box)
    return [top + edge / dpr for edge in bounds]


def measure_pixel_card(card, cell, dpr):
    card.scroll_into_view_if_needed()
    settle_fit(card.page)
    geometry = banner_geometry(card, snap_paint_baseline=cell['engine'] == 'chromium')
    state = card.locator('.banner-status-tier:first-child .banner-status-line')
    lines = [state, *card.locator('.banner-score').all()]
    model = [geometry['stateInk'], *geometry['scoreInk']]
    pixels = [screenshot_ink(line, dpr) for line in lines]
    errors = [[prediction - observed for prediction, observed in zip(model_edges, pixel_edges)]
              for model_edges, pixel_edges in zip(model, pixels)]
    offsets = [(sum(pixels[0]) - sum(score)) / 2 for score in pixels[1:]]
    result = dict(**cell, dpr=dpr, os=f'macOS {platform.mac_ver()[0]}' if platform.mac_ver()[0] else platform.platform(),
                  pixels=pixels, model=model, edge_errors=errors, state_minus_score=offsets)
    print(json.dumps(result), flush=True)
    assert all(abs(edge) <= .5 for pair in errors for edge in pair), ('pixel/model ink parity', result)
    assert all(abs(offset) <= 1.25 for offset in offsets), ('pixel state ink centre offset', result)
    return result


def assert_acumin_used(card):
    session = card.page.context.new_cdp_session(card.page)
    try:
        session.send('DOM.enable')
        session.send('CSS.enable')
        root = session.send('DOM.getDocument')['root']['nodeId']
        node = session.send('DOM.querySelector', dict(nodeId=root, selector='.match-banner .banner-score'))['nodeId']
        fonts = session.send('CSS.getPlatformFontsForNode', dict(nodeId=node))['fonts']
        assert any(font['isCustomFont'] and 'Acumin' in font['familyName'] and font['glyphCount'] == 2
                   for font in fonts), fonts
    finally:
        session.detach()


def check_pixel_ink(pw, origin, assets, dest):
    asset = assets / 'fixtures/streams.json'
    listing = json.loads(asset.read_text())
    group = listing['streams'][0]
    now = int(time.time())
    event = dict(group['streams'][0], id=9000, uri_name='basketball/matched-live',
                 name='Colorado State Rams at Arizona Wildcats', viewers='62', always_live=0,
                 starts_at=now - 3600, ends_at=now + 3600,
                 match=dict(state='in', detail='Halftime',
                            away=dict(name='Colorado State Rams', abbreviation='CSU', color='#1e4d2b',
                                      logo='/icon-32.png', score=50),
                            home=dict(name='Arizona Wildcats', abbreviation='ARIZ', color='#cc0033',
                                      logo='/icon-48.png', score=97)))
    asset.write_text(json.dumps(dict(listing, timestamp=now, streams=[dict(group, streams=[event])])))
    results = []
    for engine in ('chromium', 'webkit'):
        browser = getattr(pw, engine).launch()
        for width in (390, 1280, 320):
            page = browser.new_page(viewport={'width': width, 'height': 900}, device_scale_factor=4)
            listing_scale = 'wrapped' if width == 320 else 'listing'
            variants = ((listing_scale, '/c/basketball'), ('hero', '/'))
            for scale, path in variants:
                assert page.goto(origin + path, wait_until='networkidle').ok
                card = page.locator('a.event-card:has(.banner-score)').first
                expect(card.locator('.banner-score')).to_have_count(2)
                page.evaluate('document.fonts.ready')
                assert page.evaluate("[...document.fonts].some(face => face.family.includes('Acumin Pro Extra Condensed') && face.status === 'loaded')")
                if engine == 'chromium':
                    assert_acumin_used(card)
                if scale == 'wrapped':
                    # Feed states are single words. Replace the rendered fixture state and resize
                    # so the real component fit pass sees two lines and collapsed whitespace.
                    state = card.locator('.banner-status-tier:first-child .banner-status-line')
                    state.evaluate("el => { el.firstChild.data = 'Additional  Time'; }")
                    page.evaluate("document.documentElement.style.setProperty('font-size', '200%', 'important')")
                    settle_fit(page)
                    expect(state).to_have_attribute('data-wrap', '')
                    assert banner_geometry(card)['paint']['tier-0']['lines'] >= 2
                    offset = state.evaluate("el => parseFloat(el.style.getPropertyValue('--banner-state-offset'))")
                    assert abs(offset) < 20, ('wrapped state displaced', engine, offset)
                results.append(measure_pixel_card(card, dict(engine=engine, version=browser.version,
                                                            width=width, scale=scale), 4))
            page.close()
        browser.close()
    (dest / 'pixel-ink-report.json').write_text(json.dumps(results, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--screenshots', type=Path, required=True)
    parser.add_argument('--matches-only', action='store_true')
    parser.add_argument('--pixels-only', action='store_true')
    parser.add_argument('--text-mode', choices=('normal', 'element', 'root'), action='append',
                        help='Matched card modes to run (default: all three)')
    parser.add_argument('--measure-only', action='store_true', help='Record geometry from a baseline build')
    args = parser.parse_args()
    text_modes = args.text_mode or ('normal', 'element', 'root')
    args.screenshots.mkdir(parents=True, exist_ok=True)
    report = []
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        directory = Path(tmp)
        if args.pixels_only:
            with worker(directory, 'pixels', args.output.resolve(), '', False) as origin:
                check_pixel_ink(pw, origin, directory / 'pixels-assets', args.screenshots)
            return
        browser = pw.chromium.launch()
        if args.matches_only or args.measure_only:
            with worker(directory, 'matches', args.output.resolve(), '', False) as origin:
                check_matches(browser, origin, directory / 'matches-assets', args.screenshots, text_modes, args.measure_only)
            browser.close()
            return
        for stale in (False, True):
            name = 'stale' if stale else 'fresh'
            with worker(directory, name, args.output.resolve(), '', False) as origin:
                fixtures(directory / f'{name}-assets', stale)
                if not stale:
                    (args.screenshots / 'preview-url.txt').write_text(origin)
                for width in (320, 390, 1024, 1280):
                    for theme in ('dark', 'light'):
                        for density in ('comfortable', 'compact'):
                            report.extend(check(browser, origin, width, theme, density, args.screenshots, stale))
                            print(width, theme, density, name, 'passed', flush=True)
                if not stale:
                    check_boundaries(browser, origin, directory / f'{name}-assets', args.screenshots)
                    check_known_hero(browser, origin, directory / f'{name}-assets', args.screenshots)
                    check_matches(browser, origin, directory / f'{name}-assets', args.screenshots, text_modes)
        browser.close()
        with worker(directory, 'pixels', args.output.resolve(), '', False) as origin:
            check_pixel_ink(pw, origin, directory / 'pixels-assets', args.screenshots)
    (args.screenshots / 'report.json').write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
