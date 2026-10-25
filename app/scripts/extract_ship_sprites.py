"""
Crops each ship out of scripts/art/naval-fleet-sheet.png into assets/images/ships/ at full resolution.

Straight ships are rotated so the bow points right (the local space `drawShip` uses);
shaped ships keep their rotation-0 layout from SHAPED_SHIPS in the engine config and are
warped onto square cells, since the game stretches each sprite uniformly over its bounding box.

Usage: python scripts/extract_ship_sprites.py
"""
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
SHEET = os.path.join(HERE, "art", "naval-fleet-sheet.png")
OUT = os.path.join(HERE, "..", "assets", "images", "ships")

# name -> (approximate box on the sheet, clockwise degrees to point the bow right)
SPRITES = {
    "carrier": ((5, 60, 335, 158), 0),
    "battleship": ((355, 5, 437, 206), 90),
    "cruiser": ((510, 5, 590, 212), 90),
    "submarine": ((667, 10, 731, 207), 90),
    "destroyer": ((770, 78, 1019, 156), 0),
    "tfrigate": ((211, 205, 382, 332), 0),
    "lcorvette": ((426, 207, 570, 330), 0),
    "zraider": ((613, 205, 795, 333), 0),
}

# Shaped sprites whose arms don't line up with square cells: (cols, rows, plain-deck strip x0..x1).
# Only that strip is stretched, so turrets keep their shape and arms stay inside their cells.
# The L's long arm is ~2.4 cells on the sheet; its deck between the bridge and the end turret fills the gap.
STRETCH = {
    "lcorvette": (3, 2, (58, 80)),
}


# Straight ships whose length/beam doesn't match their cell count: (cells, [(x0, x1, weight, deck), ...]).
# Only the listed strips change width (sharing the difference by weight), so turrets and bridges stay round.
# Strips are plain deck, tapered ends or gun barrels. With `deck` set, x0 == x1 and new deck is inserted
# there instead, tiled from columns [dx0, dx1) of the sprite with rows [y0, y1) (covered by a turret)
# re-planked by repeating the clean planking rows [p0, p1).
BATTLESHIP_DECK = ((47, 58), (15, 49), (10, 15))
FIT = {
    "battleship": (4, [(36, 44, 0.6, None), (71, 71, 3, BATTLESHIP_DECK), (113, 113, 3, BATTLESHIP_DECK), (166, 176, 0.8, None)]),
    "cruiser": (3, [(8, 34, 1, None), (168, 180, 0.5, None)]),
    "submarine": (3, [(12, 60, 1, None), (135, 165, 0.6, None)]),
}

# Must match the straight-ship rect in drawShip (src/art/ships.ts): (len - 0.08) cells by 0.8 cells.
LENGTH_INSET = 0.08
BEAM = 0.8


def deck_patch(sprite, size, columns, covered, planks):
    """Plain deck: each row is the median of `columns` (so specks vanish), turret rows re-planked, plus grain."""
    (x0, x1), (y0, y1), (p0, p1) = columns, covered, planks
    src = np.asarray(sprite.crop((x0, 0, x1, sprite.height)), dtype=np.float32)
    profile = np.median(src, axis=1)
    for y in range(y0, y1):
        profile[y] = profile[p0 + (y - y0) % (p1 - p0)]
    deck = np.repeat(profile[:, None, :], size, axis=1)
    grain = np.random.default_rng(7).normal(0, 5, (sprite.height, size, 1))
    deck[..., :3] = np.clip(deck[..., :3] + grain, 0, 255)
    return Image.fromarray(deck.astype(np.uint8), "RGBA")


def warp_strips(sprite, width, strips):
    """Resizes (or inserts deck at) only the given strips so the sprite becomes `width` wide."""
    strips = sorted(strips)
    total = sum(s[2] for s in strips)
    out = Image.new("RGBA", (width, sprite.height), (0, 0, 0, 0))
    src = dst = 0
    for i, (x0, x1, weight, deck) in enumerate(strips):
        out.paste(sprite.crop((src, 0, x0, sprite.height)), (dst, 0))
        dst += x0 - src
        last = i == len(strips) - 1
        size = width - dst - (sprite.width - x1) if last else x1 - x0 + round((width - sprite.width) * weight / total)
        if deck:
            out.paste(deck_patch(sprite, size, *deck), (dst, 0))
        elif size > 0:
            out.paste(sprite.crop((x0, 0, x1, sprite.height)).resize((size, sprite.height), Image.LANCZOS), (dst, 0))
        dst += size
        src = x1
    out.paste(sprite.crop((src, 0, sprite.width, sprite.height)), (dst, 0))
    return out


def stretch_strip(sprite, cols, rows, x0, x1):
    return warp_strips(sprite, round(sprite.height * cols / rows), [(x0, x1, 1, None)])


def main():
    sheet = Image.open(SHEET).convert("RGBA")
    os.makedirs(OUT, exist_ok=True)
    for name, (box, turn) in SPRITES.items():
        sprite = sheet.crop(box)
        sprite = sprite.crop(sprite.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())
        if turn:
            sprite = sprite.rotate(-turn, expand=True)
        if name in STRETCH:
            cols, rows, (x0, x1) = STRETCH[name]
            sprite = stretch_strip(sprite, cols, rows, x0, x1)
        if name in FIT:
            cells, strips = FIT[name]
            sprite = warp_strips(sprite, round(sprite.height * (cells - LENGTH_INSET) / BEAM), strips)
        sprite.save(os.path.join(OUT, f"{name}.png"), optimize=True)
        print(f"{name}: {sprite.width}x{sprite.height}")


if __name__ == "__main__":
    main()
