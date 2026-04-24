import { hexToHSL, getContrastColor, adjustHSLForDarkMode } from './color-utils';

describe('Color Utilities', () => {
  test('hexToHSL converts hex to correct HSL values', () => {
    // Red
    expect(hexToHSL('#FF0000')).toEqual({ h: 0, s: 100, l: 50 });
    // White
    expect(hexToHSL('#FFFFFF')).toEqual({ h: 0, s: 0, l: 100 });
    // Black
    expect(hexToHSL('#000000')).toEqual({ h: 0, s: 0, l: 0 });
    // Atlas Green
    expect(hexToHSL('#0C4B33')).toEqual({ h: 156, s: 72, l: 17 });
  });

  test('getContrastColor returns correct foreground for background', () => {
    expect(getContrastColor('#000000')).toBe('#FFFFFF'); // Black bg -> White text
    expect(getContrastColor('#FFFFFF')).toBe('#000000'); // White bg -> Black text
    expect(getContrastColor('#0C4B33')).toBe('#FFFFFF'); // Dark Green -> White text
  });

  test('adjustHSLForDarkMode ensures visibility', () => {
    const darkPrimary = { h: 220, s: 50, l: 10 }; // Very dark blue
    const adjusted = adjustHSLForDarkMode(darkPrimary.h, darkPrimary.s, darkPrimary.l);
    
    expect(adjusted.l).toBeGreaterThanOrEqual(60);
    expect(adjusted.h).toBe(220);
  });
});
