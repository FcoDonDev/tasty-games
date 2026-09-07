import { columnsForWidth } from '../responsiveColumns';

describe('columnsForWidth', () => {
  it('1 columna en ancho de teléfono', () => {
    expect(columnsForWidth(328)).toBe(1); // 360 viewport - 32 padding
    expect(columnsForWidth(479)).toBe(1);
  });

  it('2 columnas desde 480', () => {
    expect(columnsForWidth(480)).toBe(2);
    expect(columnsForWidth(600)).toBe(2);
  });

  it('3 columnas desde 1024', () => {
    expect(columnsForWidth(1024)).toBe(3);
    expect(columnsForWidth(1920)).toBe(3);
  });
});
