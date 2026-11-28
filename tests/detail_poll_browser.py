"""The detail hero keeps moving across kickoff and stops at the whistle (rules 29 and 30).

Run from the repo root against a finished build:
    uv run --with playwright python tests/detail_poll_browser.py .output

The page clock is Playwright's fake clock, advanced a second at a time with a short real pause so
each 1.5 s fetch deadline never outruns its own response; a 60 s tick costs about 1.6 s of wall
time. Fixture times are fixed against one base instant; only the match state and score move.
"""
import argparse
from collections import Counter
import copy
import json
from pathlib import Path
import sys
import tempfile
import time

from playwright.sync_api import TimeoutError as PlaywrightTimeout, expect, sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from click_under_browser import worker  # noqa: E402

URI = 'basketball/hou-mia'
ITEM = '/fixtures/stream.json'
LIST = '/fixtures/streams.json'


def side(name, abbreviation, score):
    return dict(name=name, abbreviation=abbreviation, color=None, logo=None, score=score)


def match(state, away, home, detail):
    return dict(state=state, detail=detail, away=side('Miami Heat', 'MIA', away), home=side('Houston Rockets', 'HOU', home))


class Fixtures:
    def __init__(self, assets, base):
        self.assets = assets / 'fixtures'
        self.base = base
        self.detail = json.loads((self.assets / 'stream.json').read_text())
        self.listing = json.loads((self.assets / 'streams.json').read_text())

    def write(self, state, away, home, detail, starts_at, ends_at):
        item = copy.deepcopy(self.detail)
        item['data'].update(starts_at=starts_at, ends_at=ends_at, match=match(state, away, home, detail))
        (self.assets / 'stream.json').write_text(json.dumps(item))
        listing = copy.deepcopy(self.listing)
        listing['timestamp'] = self.base
        for category in listing['streams']:
            for event in category['streams']:
                if event['uri_name'] == URI:
                    event.update(starts_at=starts_at, ends_at=ends_at, match=match(state, away, home, detail))
        (self.assets / 'streams.json').write_text(json.dumps(listing))


class DetailPage:
    def __init__(self, browser, origin, base, assets):
        self.context = browser.new_context(viewport={'width': 1280, 'height': 900})
        # The fixture worker serves these as static assets with max-age=30; a fake clock moves
        # minutes of page time in a second of wall time, so read the file on every request.
        self.context.route(f'{origin}/fixtures/stream*.json', lambda route: route.fulfill(
            body=(assets / route.request.url.split('?')[0].rsplit('/', 1)[-1]).read_bytes(),
            content_type='application/json',
            headers={'cache-control': 'no-store'},
        ))
        self.page = self.context.new_page()
        self.requests = Counter()
        self.page.on('request', self._count)
        # The Python binding passes the instant in seconds; Playwright fakes `Date` from it.
        self.page.clock.install(time=base)
        self._load(origin)
        self.hero = self.page.locator('.match-banner[data-scale=hero]')
        self.pill = self.page.locator('h1 + div > span').first
        # The zero-delay arm fires during load, so it is already spent by the time goto returns;
        # keep that count or the assertion after it only ever proves the interval.
        self.loaded = self.requests[ITEM]
        self.requests.clear()

    def _load(self, origin):
        """`wrangler dev` occasionally drops a JS chunk (`ERR_INCOMPLETE_CHUNKED_ENCODING`); the SSR
        markup then looks correct while nothing polls, so wait for the client and reload once."""
        for attempt in range(3):
            self.page.goto(f'{origin}/live/{URI}', wait_until='networkidle')
            try:
                self.page.wait_for_selector('html[data-hydrated]', timeout=8000)
                return
            except PlaywrightTimeout:
                if attempt == 2:
                    raise

    def _count(self, request):
        path = request.url.split('?')[0]
        for name in (ITEM, LIST):
            if path.endswith(name):
                self.requests[name] += 1

    def tick(self, seconds):
        """Advance the page clock in steps so a started fetch beats its 1.5 s fake deadline.

        A single `run_for` would fire the poll timer and the feed's abort timer in the same
        jump, aborting every fetch; a short real pause per step lets the response land.
        """
        for _ in range(seconds):
            self.page.clock.run_for(1000)
            self.page.wait_for_timeout(25)
        self.page.wait_for_load_state('networkidle')
        self.page.wait_for_timeout(100)

    def tick_until(self, predicate, seconds):
        """Advance in sub-second steps so a change is seen mid-animation, not after it settled."""
        for _ in range(seconds * 4):
            self.page.clock.run_for(250)
            self.page.wait_for_timeout(25)
            if predicate():
                return True
        return False

    def state_ratio(self):
        """The state line's centre as a share of the banner's height, which is what the fit targets."""
        return self.hero.evaluate("""b => {
          const line = b.querySelector('.banner-status-tier:first-child .banner-status-line');
          const box = b.getBoundingClientRect(), lb = line.getBoundingClientRect();
          return (lb.top + lb.height / 2 - (box.top + box.height / 2)) / box.height;
        }""")

    def scores(self):
        return self.hero.locator('.banner-score').all_inner_texts()

    def tiers(self):
        return self.hero.locator('.banner-status-line').all_inner_texts()

    def close(self):
        self.context.close()


def check(failures, label, condition, detail):
    status = 'ok' if condition else 'FAIL'
    print(f'  {status}: {label} ({detail})', flush=True)
    if not condition:
        failures.append(f'{label}: {detail}')


def kickoff_and_whistle(browser, origin, fixtures, failures, evidence):
    """Loaded at pre outside the margin; the window opens, kickoff lands, then the final."""
    t0 = fixtures.base
    starts, ends = t0 + 200, t0 + 7200
    fixtures.write('pre', None, None, '', starts, ends)
    page = DetailPage(browser, origin, t0, fixtures.assets)
    try:
        expect(page.hero).to_be_visible()
        check(failures, 'pre: hero reads Upcoming', 'Upcoming' in page.tiers(), page.tiers())
        check(failures, 'pre: pill reads Upcoming', page.pill.inner_text().startswith('Upcoming'), page.pill.inner_text())
        check(failures, 'pre, outside the margin: item not fetched on load', page.loaded == 0, page.loaded)

        page.tick(61)  # t0+61: the 120 s margin opens at t0+80
        check(failures, 'pre, before the margin: item not polled', page.requests[ITEM] == 0, dict(page.requests))
        evidence['pre, before margin (61 s)'] = dict(page.requests)
        page.requests.clear()

        page.tick(29)  # t0+90: margin open, the item poll is armed
        page.tick(55)  # t0+145: first item tick at t0+140, still pre
        fixtures.write('in', 1, 0, "2'", starts, ends)
        page.tick(60)  # t0+205: tick at t0+200 reads the kickoff
        expect(page.hero.locator('.banner-score')).to_have_count(2, timeout=5000)
        check(failures, 'pre -> in: hero shows its own score', page.scores() == ['0', '1'], page.scores())
        check(failures, 'pre -> in: hero reads Live', 'Live' in page.tiers(), page.tiers())
        check(failures, 'pre -> in: pill reads Live', page.pill.inner_text() == 'Live', page.pill.inner_text())
        evidence['pre -> in (t0+61 .. t0+205)'] = dict(page.requests)
        # One fetch when the 120 s margin opens (t0+80), then one per 60 s beat (t0+140, t0+200).
        check(failures, 'pre -> in: item polled from the margin', page.requests[ITEM] == 3, dict(page.requests))
        page.requests.clear()

        page.page.wait_for_timeout(400)
        placed = page.state_ratio()
        fixtures.write('post', 2, 1, 'Final', starts, ends)
        # t0+265: tick at t0+260 reads the final; stop as soon as the digits swap so the band is
        # sampled while the entrance is still running.
        assert page.tick_until(lambda: page.scores() == ['1', '2'], 70), page.scores()
        raised = page.state_ratio()
        page.tick(2)
        page.page.wait_for_timeout(600)
        check(failures, 'in -> post: hero reads Final', 'Final' in page.tiers(), page.tiers())
        check(failures, 'in -> post: hero score moved', page.scores() == ['1', '2'], page.scores())
        check(failures, 'in -> post: pill reads Final', page.pill.inner_text() == 'Final', page.pill.inner_text())
        # The score's entrance is a translate, so the fit that ran on the change saw a raised digit;
        # the band has to come back to where it was once the animation settles.
        check(failures, 'in -> post: the score entrance moves the band', raised != placed,
              (round(placed, 3), round(raised, 3)))
        # The state lands 0.28 of the banner above the centre; a raised digit must not keep it elsewhere.
        check(failures, 'in -> post: state band settles after the score animation',
              abs(page.state_ratio() + 0.28) <= 0.02,
              (round(placed, 3), round(raised, 3), round(page.state_ratio(), 3)))
        evidence['in -> post, the final tick (60 s)'] = dict(page.requests)
        page.requests.clear()

        for _ in range(3):
            page.tick(61)
        check(failures, 'post: item polling stopped', page.requests[ITEM] == 0, dict(page.requests))
        check(failures, 'post: list polling stopped', page.requests[LIST] == 0, dict(page.requests))
        evidence['post, after the final (183 s)'] = dict(page.requests)
    finally:
        page.close()


def pill_contradictions(browser, origin, fixtures, failures, evidence):
    t0 = fixtures.base
    fixtures.write('pre', None, None, '', t0 - 30, t0 + 7200)
    page = DetailPage(browser, origin, t0, fixtures.assets)
    try:
        expect(page.hero).to_be_visible()
        check(failures, 'pre past kickoff: hero reads Upcoming', 'Upcoming' in page.tiers(), page.tiers())
        check(failures, 'pre past kickoff: pill reads Upcoming, not Live', page.pill.inner_text() == 'Upcoming', page.pill.inner_text())
        # Well under the 60 s cadence, so this is the zero-delay arm and not a beat. Wait for it
        # rather than sampling once: the arm is set after hydration, which races `networkidle`.
        page.page.wait_for_timeout(500)
        for _ in range(20):
            if page.loaded + page.requests[ITEM]:
                break
            page.page.wait_for_timeout(100)
        check(failures, 'pre past kickoff: item fetched at once', page.loaded + page.requests[ITEM] >= 1,
              page.loaded + page.requests[ITEM])
        page.tick(61)
        check(failures, 'pre past kickoff: item keeps polling', page.requests[ITEM] >= 1, dict(page.requests))
        evidence['pre past kickoff (61 s)'] = dict(page.requests)
    finally:
        page.close()

    fixtures.write('pre', None, None, '', t0 - 1200, t0 + 7200)
    page = DetailPage(browser, origin, t0, fixtures.assets)
    try:
        expect(page.hero).to_be_visible()
        check(failures, 'pre long past kickoff: hero reads Delayed', 'Delayed' in page.tiers(), page.tiers())
        check(failures, 'pre long past kickoff: pill reads Delayed', page.pill.inner_text() == 'Delayed', page.pill.inner_text())
        # Well under the 60 s cadence, so this is the zero-delay arm and not a beat. Wait for it
        # rather than sampling once: the arm is set after hydration, which races `networkidle`.
        page.page.wait_for_timeout(500)
        for _ in range(20):
            if page.loaded + page.requests[ITEM]:
                break
            page.page.wait_for_timeout(100)
        check(failures, 'pre long past kickoff: item fetched at once', page.loaded + page.requests[ITEM] >= 1,
              page.loaded + page.requests[ITEM])
        page.tick(61)
        check(failures, 'pre long past kickoff: item keeps polling', page.requests[ITEM] >= 1, dict(page.requests))
        evidence['pre long past kickoff (61 s)'] = dict(page.requests)
    finally:
        page.close()

    fixtures.write('in', 3, 3, 'OT', t0 - 9000, t0 - 60)
    page = DetailPage(browser, origin, t0, fixtures.assets)
    try:
        expect(page.hero).to_be_visible()
        check(failures, 'in past the window: hero reads Live', 'Live' in page.tiers(), page.tiers())
        check(failures, 'in past the window: pill reads Live, not Ended', page.pill.inner_text() == 'Live', page.pill.inner_text())
        # Already live: polling starts on mount and the first beat is the cadence, not a zero-delay arm.
        page.tick(61)
        check(failures, 'in past the window: item polls on the cadence', page.requests[ITEM] == 1, dict(page.requests))
        evidence['in past the window (61 s)'] = dict(page.requests)
    finally:
        page.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    failures, evidence = [], {}
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        directory = Path(tmp)
        with worker(directory, 'poll', args.output.resolve(), '', False) as origin:
            fixtures = Fixtures(directory / 'poll-assets', int(time.time()))
            browser = pw.chromium.launch()
            try:
                print('kickoff and whistle:', flush=True)
                kickoff_and_whistle(browser, origin, fixtures, failures, evidence)
                print('pill contradictions:', flush=True)
                pill_contradictions(browser, origin, fixtures, failures, evidence)
            finally:
                browser.close()
    print('requests:', json.dumps(evidence, indent=2))
    if failures:
        print(f'{len(failures)} failed', file=sys.stderr)
        sys.exit(1)
    print('all passed')


if __name__ == '__main__':
    main()
