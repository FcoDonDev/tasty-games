import {
  comboChainForEaten,
  DEATH_FREEZE_MS,
  END_DELAY_LOST_MS,
  END_DELAY_WON_MS,
  hitStopForEvent,
  popupForEvent,
  SPECIAL_HIT_STOP_MS,
} from '../engine/feel';

describe('feel serpiente (T4)', () => {
  test('popup por evento (D17 score-float)', () => {
    expect(popupForEvent('eat')).toEqual({ text: '+10', color: '#FBBF24' });
    expect(popupForEvent('special')).toEqual({ text: '+50', color: '#C4B5FD' });
    expect(popupForEvent({ type: 'die', cause: 'self', cell: null })).toBeNull();
    expect(popupForEvent('win')).toBeNull();
  });

  test('hit-stop solo en el especial', () => {
    expect(hitStopForEvent('special')).toBe(SPECIAL_HIT_STOP_MS);
    expect(hitStopForEvent('eat')).toBe(0);
    expect(hitStopForEvent({ type: 'die', cause: 'wall', cell: null })).toBe(0);
    expect(hitStopForEvent('win')).toBe(0);
  });

  test('el pitch sube cada 5 comidas', () => {
    expect([0, 1, 4].map(comboChainForEaten)).toEqual([1, 1, 1]);
    expect([5, 9].map(comboChainForEaten)).toEqual([2, 2]);
    expect(comboChainForEaten(10)).toBe(3);
  });

  test('tiempos de muerte/overlay coherentes', () => {
    expect(DEATH_FREEZE_MS).toBe(400);
    expect(END_DELAY_LOST_MS).toBeGreaterThan(DEATH_FREEZE_MS);
    expect(END_DELAY_WON_MS).toBe(600);
  });
});
