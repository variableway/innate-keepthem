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

def create_icon(size):
    """Create a YouTube-style icon with play button."""
    rgba = bytearray(size * size * 4)
    
    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            
            cx, cy = size / 2, size / 2
            radius = min(size / 2 - 1, size * 0.45)
            corner_radius = size * 0.2
            
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
            if (corner_radius <= x < size - corner_radius and 
                0 <= y < size):
                in_rounded = True
            elif (0 <= x < size and 
                  corner_radius <= y < size - corner_radius):
                in_rounded = True
            elif in_corners:
                in_rounded = True
            
            if in_rounded:
                play_tip_x = size * 0.35
                play_base_x = size * 0.75
                play_top_y = size * 0.25
                play_bottom_y = size * 0.75
                
                in_play = False
                if x >= play_tip_x and x <= play_base_x:
                    progress = (x - play_tip_x) / (play_base_x - play_tip_x)
                    y_center = (play_top_y + play_bottom_y) / 2
                    y_range = (play_bottom_y - play_top_y) / 2
                    y_half = y_range * progress
                    if abs(y - y_center) <= y_half:
                        in_play = True
                
                if in_play:
                    rgba[idx:idx+4] = [255, 255, 255, 255]
                else:
                    rgba[idx:idx+4] = [204, 0, 0, 255]
            else:
                rgba[idx:idx+4] = [0, 0, 0, 0]
    
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
