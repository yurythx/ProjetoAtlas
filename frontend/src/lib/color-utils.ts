/**
 * Utilitários para manipulação de cores e temas dinâmicos.
 * Segue as melhores práticas para injeção de CSS Variables.
 */

export function hexToHSL(hex: string) {
  // Remove o # se existir
  hex = hex.replace(/^#/, "");

  // Converte para RGB
  let r = 0, g = 0, b = 0;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  }

  // Converte RGB para HSL
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function getContrastColor(hex: string) {
  if (!hex) return '#FFFFFF';
  hex = hex.replace(/^#/, "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#FFFFFF';
}

/**
 * Ajusta a luminosidade de uma cor HSL para garantir visibilidade em temas escuros.
 */
export function adjustHSLForDarkMode(h: number, s: number, l: number) {
  // Em temas escuros, queremos que a cor de destaque seja um pouco mais clara e vibrante
  // se ela for muito escura originalmente.
  const newL = Math.max(l, 60); // Garante pelo menos 60% de luminosidade
  return { h, s, l: newL };
}
