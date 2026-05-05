#!/usr/bin/env python3
"""Generate PNG icons for the Chrome extension."""

import os
import struct
import zlib


def create_png(width, height, rgba_data):
    """Create a PNG file from RGBA data."""
    def png_chunk(chunk_type, data):
        chunk_len = struct.pack('>I', len(data))
        chunk_crc = struct.pack('>I', zlib.crc32(chunk_type + data) & 0xffffffff)
        return chunk_len + chunk_type + data + chunk_crc

    signature = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)

    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'
        for x in range(width):
            idx = (y * width + x) * 4
            raw_data += rgba_data[idx:idx+4]

    compressed = zlib.compress(raw_data)

    png_data = signature
    png_data += png_chunk(b'IHDR', ihdr)
    png_data += png_chunk(b'IDAT', compressed)
    png_data += png_chunk(b'IEND', b'')

    return png_data


def draw_rounded_rect(rgba, size, corner_radius, color):
    """Draw a rounded rectangle on the RGBA buffer."""
    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4

            # Check if pixel is inside rounded rect
            in_rect = (corner_radius <= x < size - corner_radius and
                       corner_radius <= y < size - corner_radius)

            in_corners = False
            corners = [
                (corner_radius, corner_radius),
                (size - corner_radius - 1, corner_radius),
                (corner_radius, size - corner_radius - 1),
                (size - corner_radius - 1, size - corner_radius - 1)
            ]
            for cx_c, cy_c in corners:
                if ((x - cx_c) ** 2 + (y - cy_c) ** 2) <= corner_radius ** 2:
                    in_corners = True
                    break

            in_rounded = False
            if (corner_radius <= x < size - corner_radius and 0 <= y < size):
                in_rounded = True
            elif (0 <= x < size and corner_radius <= y < size - corner_radius):
                in_rounded = True
            elif in_corners:
                in_rounded = True

            if in_rounded:
                rgba[idx:idx+4] = color


def draw_tray(rgba, size, tray_left, tray_top, tray_w, tray_h, thickness, color):
    """Draw a tray/box shape."""
    tray_right = tray_left + tray_w
    tray_bottom = tray_top + tray_h
    tray_radius = tray_h * 0.3

    def set_pixel(x, y, c):
        if 0 <= x < size and 0 <= y < size:
            idx = (int(y) * size + int(x)) * 4
            rgba[idx:idx+4] = c

    def draw_line(x1, y1, x2, y2, thick, c):
        # Simple line drawing
        steps = int(max(abs(x2 - x1), abs(y2 - y1)) * 2) + 1
        for i in range(steps):
            t = i / steps if steps > 0 else 0
            px = x1 + (x2 - x1) * t
            py = y1 + (y2 - y1) * t
            for dx in range(-thick // 2, thick // 2 + 1):
                for dy in range(-thick // 2, thick // 2 + 1):
                    set_pixel(px + dx, py + dy, c)

    # Top line
    draw_line(tray_left + tray_radius, tray_top, tray_right - tray_radius, tray_top, thickness, color)
    # Side lines
    draw_line(tray_left, tray_top + tray_radius, tray_left, tray_bottom - tray_radius, thickness, color)
    draw_line(tray_right, tray_top + tray_radius, tray_right, tray_bottom - tray_radius, thickness, color)
    # Bottom line
    draw_line(tray_left + tray_radius, tray_bottom, tray_right - tray_radius, tray_bottom, thickness, color)

    # Bottom corners (arcs approximated with small segments)
    import math
    steps = 20
    for i in range(steps):
        angle = math.pi + (math.pi / 2) * (i / steps)
        cx = tray_left + tray_radius
        cy = tray_bottom - tray_radius
        px = cx + tray_radius * math.cos(angle)
        py = cy + tray_radius * math.sin(angle)
        for dx in range(-thickness // 2, thickness // 2 + 1):
            for dy in range(-thickness // 2, thickness // 2 + 1):
                set_pixel(px + dx, py + dy, color)

    for i in range(steps):
        angle = 1.5 * math.pi + (math.pi / 2) * (i / steps)
        cx = tray_right - tray_radius
        cy = tray_bottom - tray_radius
        px = cx + tray_radius * math.cos(angle)
        py = cy + tray_radius * math.sin(angle)
        for dx in range(-thickness // 2, thickness // 2 + 1):
            for dy in range(-thickness // 2, thickness // 2 + 1):
                set_pixel(px + dx, py + dy, color)


def draw_polygon(rgba, size, points, color):
    """Draw a filled polygon using scanline fill."""
    # Find bounds
    min_y = max(0, int(min(p[1] for p in points)))
    max_y = min(size - 1, int(max(p[1] for p in points)))

    for y in range(min_y, max_y + 1):
        # Find intersections with polygon edges
        intersections = []
        n = len(points)
        for i in range(n):
            x1, y1 = points[i]
            x2, y2 = points[(i + 1) % n]
            if (y1 <= y < y2) or (y2 <= y < y1):
                if y2 != y1:
                    t = (y - y1) / (y2 - y1)
                    ix = x1 + t * (x2 - x1)
                    intersections.append(ix)

        intersections.sort()
        for i in range(0, len(intersections), 2):
            if i + 1 < len(intersections):
                x_start = max(0, int(intersections[i]))
                x_end = min(size, int(intersections[i + 1]) + 1)
                for x in range(x_start, x_end):
                    idx = (y * size + x) * 4
                    rgba[idx:idx+4] = color


def create_icon(size):
    """Create a 'keep/save' themed icon."""
    rgba = bytearray(size * size * 4)

    # Background color: slate-800 #1e293b
    bg_color = [30, 41, 59, 255]
    white = [255, 255, 255, 255]
    corner_radius = int(size * 0.22)

    draw_rounded_rect(rgba, size, corner_radius, bg_color)

    # Tray at bottom
    tray_w = size * 0.50
    tray_h = size * 0.14 if size > 32 else size * 0.12
    tray_x = (size - tray_w) / 2
    tray_y = size * 0.58
    thickness = max(1, size // 16)

    draw_tray(rgba, size, tray_x, tray_y, tray_w, tray_h, thickness, white)

    # Downward arrow
    arrow_shaft_w = size * 0.10
    arrow_head_w = size * 0.26
    arrow_head_h = size * 0.14
    arrow_top = size * 0.22
    arrow_bottom = tray_y - size * 0.06

    center_x = size / 2
    shaft_left = center_x - arrow_shaft_w / 2
    shaft_right = center_x + arrow_shaft_w / 2

    # Arrow shaft
    draw_polygon(rgba, size, [
        (shaft_left, arrow_top),
        (shaft_right, arrow_top),
        (shaft_right, arrow_bottom - arrow_head_h * 0.2),
        (shaft_left, arrow_bottom - arrow_head_h * 0.2),
    ], white)

    # Arrow head
    head_top = arrow_bottom - arrow_head_h
    draw_polygon(rgba, size, [
        (center_x - arrow_head_w / 2, head_top),
        (center_x + arrow_head_w / 2, head_top),
        (center_x, arrow_bottom),
    ], white)

    return bytes(rgba)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = script_dir

    for size in [16, 48, 128]:
        rgba_data = create_icon(size)
        png_data = create_png(size, size, rgba_data)

        filename = os.path.join(icons_dir, f'icon{size}.png')
        with open(filename, 'wb') as f:
            f.write(png_data)
        print(f'Generated {filename}')


if __name__ == '__main__':
    main()
