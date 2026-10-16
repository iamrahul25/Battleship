"""
Generates the app's original (CC0) assets: icons/splash with Pillow and all
sound effects + music loops synthesized from scratch with the standard library.

Usage: python scripts/generate_assets.py
"""
import math
import os
import random
import struct
import wave

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..", "assets")
IMG = os.path.join(ROOT, "images")
SND = os.path.join(ROOT, "sounds")
MUS = os.path.join(ROOT, "music")
RATE = 22050

NAVY900 = (10, 22, 40)
NAVY700 = (19, 41, 75)
OCEAN500 = (30, 90, 138)
OCEAN300 = (79, 163, 217)
STEEL400 = (138, 155, 176)
STEEL100 = (227, 233, 240)
RED = (229, 57, 53)
GREEN = (61, 220, 151)
BRASS = (212, 169, 58)


# ---------------------------------------------------------------- images

def draw_emblem(size, background=True):
    s = size
    img = Image.new("RGBA", (s, s), NAVY900 + (255,) if background else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = s / 2
    r = s * 0.42
    # sonar disc
    d.ellipse([c - r, c - r, c + r, c + r], fill=NAVY700 + (255,), outline=BRASS + (255,), width=max(2, s // 64))
    for k in (0.33, 0.66):
        rr = r * k
        d.ellipse([c - rr, c - rr, c + rr, c + rr], outline=OCEAN300 + (110,), width=max(1, s // 200))
    d.line([c - r, c, c + r, c], fill=OCEAN300 + (90,), width=max(1, s // 256))
    d.line([c, c - r, c, c + r], fill=OCEAN300 + (90,), width=max(1, s // 256))
    # radar sweep wedge
    sweep = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sweep)
    sd.pieslice([c - r, c - r, c + r, c + r], 290, 340, fill=GREEN + (70,))
    img = Image.alpha_composite(img, sweep)
    d = ImageDraw.Draw(img)
    # battleship silhouette (top-down, diagonal)
    ship = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sh = ImageDraw.Draw(ship)
    L, W = r * 1.35, r * 0.30
    hull = [(c - L / 2, c), (c - L / 2 + W * 0.6, c - W / 2), (c + L / 2 - W * 1.2, c - W / 2),
            (c + L / 2, c), (c + L / 2 - W * 1.2, c + W / 2), (c - L / 2 + W * 0.6, c + W / 2)]
    sh.polygon(hull, fill=STEEL400 + (255,), outline=STEEL100 + (255,))
    for i, fx in enumerate((-0.28, -0.08, 0.2)):
        tx = c + L * fx
        tr = W * (0.28 if i != 1 else 0.36)
        sh.ellipse([tx - tr, c - tr, tx + tr, c + tr], fill=NAVY700 + (255,), outline=STEEL100 + (255,))
        sh.line([tx, c, tx + tr * 2.2, c], fill=STEEL100 + (255,), width=max(2, s // 120))
    ship = ship.rotate(35, resample=Image.BICUBIC, center=(c, c))
    img = Image.alpha_composite(img, ship)
    d = ImageDraw.Draw(img)
    # red hit marker / crosshair
    hx, hy, hr = c + r * 0.45, c - r * 0.45, s * 0.06
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([hx - hr * 2, hy - hr * 2, hx + hr * 2, hy + hr * 2], fill=RED + (120,))
    glow = glow.filter(ImageFilter.GaussianBlur(s / 60))
    img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=RED + (255,), outline=STEEL100 + (255,), width=max(2, s // 150))
    w = max(2, s // 160)
    d.line([hx - hr * 2.2, hy, hx - hr * 1.3, hy], fill=STEEL100 + (255,), width=w)
    d.line([hx + hr * 1.3, hy, hx + hr * 2.2, hy], fill=STEEL100 + (255,), width=w)
    d.line([hx, hy - hr * 2.2, hx, hy - hr * 1.3], fill=STEEL100 + (255,), width=w)
    d.line([hx, hy + hr * 1.3, hx, hy + hr * 2.2], fill=STEEL100 + (255,), width=w)
    return img


def make_images():
    os.makedirs(IMG, exist_ok=True)
    draw_emblem(1024).convert("RGB").save(os.path.join(IMG, "icon.png"))
    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    emblem = draw_emblem(680, background=False)
    fg.paste(emblem, (172, 172), emblem)
    fg.save(os.path.join(IMG, "adaptive-icon.png"))
    draw_emblem(512, background=False).save(os.path.join(IMG, "splash-icon.png"))
    draw_emblem(64).resize((48, 48), Image.LANCZOS).save(os.path.join(IMG, "favicon.png"))


# ---------------------------------------------------------------- audio

def write_wav(path, samples, rate=RATE):
    peak = max(1e-9, max(abs(v) for v in samples))
    gain = 0.9 / peak if peak > 0.9 else 1.0
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v * gain)) * 32767)) for v in samples))


def n(seconds):
    return int(seconds * RATE)


def silence(seconds):
    return [0.0] * n(seconds)


def mix(*tracks):
    length = max(len(t) for t in tracks)
    out = [0.0] * length
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    return out


def place(track, clip, at, gain=1.0):
    start = n(at)
    if len(track) < start + len(clip):
        track.extend([0.0] * (start + len(clip) - len(track)))
    for i, v in enumerate(clip):
        track[start + i] += v * gain
    return track


def env(length, attack=0.005, decay=None, release=0.05):
    out = []
    a, r = n(attack), n(release)
    for i in range(length):
        g = 1.0
        if i < a:
            g = i / max(1, a)
        if decay:
            g *= math.exp(-i / (decay * RATE))
        if i > length - r:
            g *= max(0.0, (length - i) / max(1, r))
        out.append(g)
    return out


def tone(freq, seconds, kind="sine", vib=0.0, vib_rate=5.0, freq_end=None):
    out, phase = [], 0.0
    total = n(seconds)
    for i in range(total):
        t = i / RATE
        f = freq if freq_end is None else freq * (freq_end / freq) ** (i / max(1, total))
        f *= 1 + vib * math.sin(2 * math.pi * vib_rate * t)
        phase += 2 * math.pi * f / RATE
        if kind == "sine":
            v = math.sin(phase)
        elif kind == "square":
            v = math.tanh(3 * math.sin(phase))
        elif kind == "saw":
            v = 2 * ((phase / (2 * math.pi)) % 1) - 1
        elif kind == "brass":
            v = sum(math.sin(phase * h) / h ** 1.1 for h in range(1, 7))
        else:
            v = math.sin(phase)
        out.append(v)
    return out


def noise(seconds, seed=1):
    rnd = random.Random(seed)
    return [rnd.uniform(-1, 1) for _ in range(n(seconds))]


def lowpass(samples, cutoff_start, cutoff_end=None):
    out, y = [], 0.0
    total = len(samples)
    for i, x in enumerate(samples):
        c = cutoff_start if cutoff_end is None else cutoff_start + (cutoff_end - cutoff_start) * i / max(1, total)
        a = 1 - math.exp(-2 * math.pi * c / RATE)
        y += a * (x - y)
        out.append(y)
    return out


def highpass(samples, cutoff):
    lp = lowpass(samples, cutoff)
    return [x - l for x, l in zip(samples, lp)]


def apply(samples, envelope):
    return [s * e for s, e in zip(samples, envelope)]


def echo(samples, delay, feedback=0.35, taps=3):
    out = samples + [0.0] * (n(delay) * taps)
    for k in range(1, taps + 1):
        g = feedback ** k
        off = n(delay) * k
        for i, v in enumerate(samples):
            out[i + off] += v * g
    return out


def explosion(seconds=1.0, seed=3, cutoff=900, body=55):
    burst = apply(lowpass(noise(seconds, seed), cutoff, 120), env(n(seconds), 0.002, seconds * 0.28))
    thump = apply(tone(body, seconds * 0.6, freq_end=body * 0.5), env(n(seconds * 0.6), 0.002, 0.15))
    crackle = apply(highpass(noise(seconds * 0.4, seed + 7), 2500), env(n(seconds * 0.4), 0.001, 0.06))
    return mix(burst, [v * 1.4 for v in thump], [v * 0.25 for v in crackle])


def whistle(seconds=0.5, f0=1800, f1=700):
    return apply(tone(f0, seconds, vib=0.01, vib_rate=30, freq_end=f1), env(n(seconds), 0.05, None, 0.04))


def make_sounds():
    os.makedirs(SND, exist_ok=True)
    sfx = {}
    sfx["click"] = mix(
        apply(highpass(noise(0.04, 2), 3000), env(n(0.04), 0.0005, 0.008)),
        [v * 0.4 for v in apply(tone(2400, 0.04), env(n(0.04), 0.0005, 0.01))],
    )
    sfx["pickup"] = apply(tone(220, 0.12, freq_end=440), env(n(0.12), 0.002, 0.05))
    sfx["drop"] = mix(
        apply(tone(140, 0.2, freq_end=70), env(n(0.2), 0.001, 0.06)),
        [v * 0.4 for v in apply(lowpass(noise(0.2, 4), 600), env(n(0.2), 0.001, 0.05))],
    )
    sfx["rotate"] = apply(tone(500, 0.16, kind="square", vib=0.08, vib_rate=40, freq_end=800), env(n(0.16), 0.01, 0.08))
    sfx["invalid"] = apply(tone(110, 0.25, kind="square"), env(n(0.25), 0.005, 0.15))
    sfx["ready"] = apply(mix(tone(98, 0.9, kind="brass", vib=0.006), [v * 0.6 for v in tone(147, 0.9, kind="brass")]), env(n(0.9), 0.06, None, 0.2))
    sfx["fire"] = mix(
        explosion(0.6, seed=11, cutoff=1500, body=70),
        place(silence(0.1), whistle(0.45, 2200, 900), 0.1, 0.25),
    )
    splash = apply(lowpass(noise(0.7, 21), 3000, 400), env(n(0.7), 0.01, 0.18))
    bubbles = []
    rnd = random.Random(5)
    for _ in range(10):
        f = rnd.uniform(500, 1200)
        place(bubbles, apply(tone(f, 0.05, freq_end=f * 1.6), env(n(0.05), 0.001, 0.015)), rnd.uniform(0.1, 0.6), 0.25)
    sfx["miss"] = mix(splash, bubbles)
    sfx["hit"] = explosion(1.0, seed=31)
    sunk = explosion(1.6, seed=41, cutoff=700, body=45)
    creak = apply(tone(90, 1.2, kind="saw", vib=0.05, vib_rate=3), env(n(1.2), 0.3, None, 0.4))
    place(sunk, lowpass(creak, 500), 0.5, 0.35)
    place(sunk, bubbles, 1.0, 1.0)
    sfx["sunk"] = sunk
    art = whistle(0.7, 2000, 500)
    art = [v * 0.3 for v in art]
    for k in range(5):
        place(art, explosion(0.8, seed=50 + k), 0.6 + k * 0.08, 0.8)
    sfx["artillery"] = art
    ping = apply(tone(1150, 0.9), env(n(0.9), 0.002, 0.25))
    sfx["sonar"] = echo(ping, 0.32, 0.35, 3)
    sfx["turn"] = mix(
        place(silence(0.0), apply(tone(1320, 0.07, kind="square"), env(n(0.07), 0.002, 0.04)), 0.0, 0.5),
        place(silence(0.0), apply(tone(1760, 0.09, kind="square"), env(n(0.09), 0.002, 0.05)), 0.09, 0.5),
        [v * 0.08 for v in apply(highpass(noise(0.2, 9), 1500), env(n(0.2), 0.01, 0.1))],
    )
    sfx["tick"] = apply(mix(tone(1800, 0.03), [v * 0.5 for v in highpass(noise(0.03, 13), 4000)]), env(n(0.03), 0.0005, 0.006))
    fan = []
    notes = [(392, 0.0, 0.18), (523, 0.2, 0.18), (659, 0.4, 0.18), (784, 0.6, 0.7), (659, 1.0, 0.15), (784, 1.18, 0.9)]
    for f, at, d in notes:
        place(fan, apply(tone(f, d, kind="brass", vib=0.004), env(n(d), 0.02, None, 0.08)), at, 0.5)
        place(fan, apply(tone(f / 2, d, kind="brass"), env(n(d), 0.02, None, 0.08)), at, 0.25)
    place(fan, apply(lowpass(noise(0.5, 70), 300), env(n(0.5), 0.001, 0.1)), 0.6, 0.4)
    sfx["victory"] = fan
    sfx["defeat"] = mix(
        apply(tone(110, 1.6, kind="brass", vib=0.004, freq_end=98), env(n(1.6), 0.1, None, 0.5)),
        place(silence(0), apply(tone(82, 1.2, kind="brass"), env(n(1.2), 0.1, None, 0.5)), 0.5, 0.7),
    )
    chime = []
    for k, f in enumerate((1047, 1319, 1568, 2093)):
        place(chime, apply(tone(f, 0.8), env(n(0.8), 0.002, 0.25)), k * 0.07, 0.4)
    sfx["badge"] = chime
    klax = []
    for k in range(3):
        place(klax, apply(tone(440, 0.22, kind="square", freq_end=660), env(n(0.22), 0.01, None, 0.03)), k * 0.26, 0.45)
    sfx["found"] = klax
    for name, samples in sfx.items():
        write_wav(os.path.join(SND, f"{name}.wav"), samples)


def make_music():
    os.makedirs(MUS, exist_ok=True)
    # Menu: slow pad chords over an ocean swell, 4 chords x 4 s = 16 s seamless loop.
    chords = [(110, 165, 220, 277), (98, 147, 196, 247), (87, 131, 175, 220), (98, 147, 196, 233)]
    pad = []
    for i, chord in enumerate(chords):
        seg = mix(*[apply(tone(f, 4.0, vib=0.003, vib_rate=0.3), env(n(4.0), 0.8, None, 0.8)) for f in chord])
        place(pad, lowpass(seg, 900), i * 4.0, 0.18)
    ocean = lowpass(noise(16.0, 99), 500)
    ocean = [v * (0.5 + 0.5 * math.sin(2 * math.pi * i / (RATE * 8))) * 0.9 for i, v in enumerate(ocean)]
    menu = mix(pad[: n(16)], ocean)
    write_wav(os.path.join(MUS, "menu.wav"), menu)

    # Battle: 120 bpm, 4 bars (8 s) of kick/snare/tom ostinato with a low bass.
    beat = 0.5
    kick = apply(tone(110, 0.25, freq_end=45), env(n(0.25), 0.001, 0.08))
    snare = mix(apply(highpass(noise(0.2, 5), 1200), env(n(0.2), 0.001, 0.05)), [v * 0.3 for v in apply(tone(190, 0.1), env(n(0.1), 0.001, 0.03))])
    tom = apply(tone(150, 0.2, freq_end=90), env(n(0.2), 0.001, 0.07))
    hat = apply(highpass(noise(0.05, 8), 6000), env(n(0.05), 0.001, 0.01))
    track = silence(8.0)
    for bar in range(4):
        b0 = bar * 4 * beat
        for k in range(4):
            place(track, kick, b0 + k * beat, 0.9 if k in (0, 2) else 0.5)
        place(track, snare, b0 + beat, 0.5)
        place(track, snare, b0 + 3 * beat, 0.5)
        for k in range(8):
            place(track, hat, b0 + k * beat / 2, 0.15)
        if bar % 2 == 1:
            for k, at in enumerate((3.0, 3.25, 3.5, 3.75)):
                place(track, tom, b0 + at * beat, 0.4 + 0.1 * k)
        root = (55, 55, 49, 52)[bar]
        for k in range(8):
            f = root * (1.5 if k % 4 == 3 else 1.0)
            place(track, lowpass(apply(tone(f, beat / 2 * 0.9, kind="saw"), env(n(beat / 2 * 0.9), 0.005, 0.12)), 400), b0 + k * beat / 2, 0.35)
    write_wav(os.path.join(MUS, "battle.wav"), track[: n(8.0)])


if __name__ == "__main__":
    make_images()
    make_sounds()
    make_music()
    print("Assets generated in", os.path.abspath(ROOT))
