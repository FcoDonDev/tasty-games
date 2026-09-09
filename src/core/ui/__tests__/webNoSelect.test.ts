import { NO_SELECT_CSS, injectNoSelectStyle } from '../webNoSelect';

type FakeNode = { id: string; textContent: string };

function fakeDoc(existing: FakeNode[] = []) {
  const appended: FakeNode[] = [];
  const doc = {
    getElementById: (id: string) => [...existing, ...appended].find((node) => node.id === id) ?? null,
    createElement: (tag: string) => {
      expect(tag).toBe('style');
      return { id: '', textContent: '' };
    },
    head: { appendChild: (node: unknown) => void appended.push(node as FakeNode) },
  };
  return { doc: doc as unknown as Document, appended };
}

describe('injectNoSelectStyle', () => {
  it('inyecta un <style> con el CSS anti-selección', () => {
    const { doc, appended } = fakeDoc();
    expect(injectNoSelectStyle(doc)).toBe(true);
    expect(appended).toHaveLength(1);
    expect(appended[0].id).toBe('web-no-select');
    expect(appended[0].textContent).toContain('user-select: none');
    expect(appended[0].textContent).toContain('-webkit-user-select: none');
    expect(appended[0].textContent).toContain('-webkit-touch-callout: none');
  });

  it('es idempotente: con el estilo ya presente no vuelve a inyectar', () => {
    const { doc, appended } = fakeDoc([{ id: 'web-no-select', textContent: NO_SELECT_CSS }]);
    expect(injectNoSelectStyle(doc)).toBe(false);
    expect(appended).toHaveLength(0);
  });
});

describe('NO_SELECT_CSS', () => {
  it('es CSS puro con los tres mecanismos bloqueados', () => {
    expect(NO_SELECT_CSS).toMatch(/user-select:\s*none/);
    expect(NO_SELECT_CSS).toMatch(/-webkit-user-select:\s*none/);
    expect(NO_SELECT_CSS).toMatch(/-webkit-touch-callout:\s*none/);
  });
});
