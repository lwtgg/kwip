"""Contrast from browser-resolved gradient layers and live text colours.

The vertical shade is transparent at mid-height, the brightest scanline.
Sample every pixel along that line, plus subpixels to cover gradient interiors.
"""
import re


def assert_banner_contrast(banner):
    rendered = banner.evaluate('''el => ({
      background: getComputedStyle(el).backgroundImage,
      fill: el.querySelector('[role=progressbar] > div') &&
        getComputedStyle(el.querySelector('[role=progressbar] > div')).backgroundColor,
      colors: [...el.querySelectorAll('.banner-score, .banner-status-line, .banner-initials, .banner-abbreviation')]
        .map(n => getComputedStyle(n).color)
    })''')
    layers = re.split(r', (?=linear-gradient)', rendered['background'])
    assert len(layers) == 3, rendered
    colors = lambda layer: re.findall(r'color\(srgb ([^)]+)\)|rgba?\(([^)]+)\)', layer)
    def rgb(item):
        srgb, legacy = item
        values = [float(n) for n in re.findall(r'[\d.]+', srgb or legacy)]
        if not srgb:
            values[:3] = [n / 255 for n in values[:3]]
        return values[:3], values[3] if len(values) > 3 else 1
    scrim_stops = [rgb(c) for c in colors(layers[1])]
    assert len(scrim_stops) == 2 and scrim_stops[0] == scrim_stops[1], rendered
    scrim, alpha = scrim_stops[0]
    field = [rgb(c)[0] for c in colors(layers[2])]
    assert len(field) in (2, 3), rendered
    def luminance(c):
        return sum(w * (v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4)
                   for w, v in zip((.2126, .7152, .0722), c))
    foregrounds = [rgb(('', re.search(r'\(([^)]+)\)', c)[1]))[0] for c in rendered['colors']]
    fill = rgb(colors(rendered['fill'])[0])[0] if rendered['fill'] else None
    minimum = float('inf')
    fill_minimum = float('inf')
    for a, b in zip(field, field[1:]):
        for step in range(1001):
            t = step / 1000
            bg = [((1-t)*x+t*y)*(1-alpha)+s*alpha for x,y,s in zip(a,b,scrim)]
            ground = luminance(bg)
            if fill:
                light = luminance(fill)
                fill_minimum = min(fill_minimum, (max(light, ground)+.05)/(min(light, ground)+.05))
            for fg in foregrounds:
                light = luminance(fg)
                minimum = min(minimum, (max(light, ground)+.05)/(min(light, ground)+.05))
    assert minimum >= 4.5, ('rendered banner contrast', minimum, rendered)
    assert fill_minimum >= 3, ('timeline fill contrast', fill_minimum, rendered)
    return dict(contrast=minimum, fill_contrast=fill_minimum if fill else None)
