import { arrangeWidgets, DeclaredWidget, DEFAULT_LAYOUT, Layout, resolveLayout } from './layout';

const declared: DeclaredWidget[] = [
  { id: 'tasks.today', size: 'small' },
  { id: 'music.now-playing', size: 'small' },
  { id: 'finance.month', size: 'medium' },
];

describe('arrangeWidgets', () => {
  it('shows the widgets as declared until the user arranges them', () => {
    expect(arrangeWidgets(declared, DEFAULT_LAYOUT)).toEqual(
      declared.map((widget) => ({ ...widget, hidden: false })),
    );
  });

  it('follows the order, the sizes and the hidden marks of the layout', () => {
    const layout: Layout = {
      hiddenSections: [],
      widgets: [
        { id: 'finance.month', hidden: false, size: 'large' },
        { id: 'tasks.today', hidden: true, size: null },
      ],
    };
    expect(arrangeWidgets(declared, layout)).toEqual([
      { id: 'finance.month', size: 'large', hidden: false },
      { id: 'tasks.today', size: 'small', hidden: true },
      // Not in the layout: a widget that appeared after it was saved.
      { id: 'music.now-playing', size: 'small', hidden: false },
    ]);
  });

  it('hides the widgets of a hidden section and forgets the ones that are gone', () => {
    const layout: Layout = {
      hiddenSections: ['music'],
      widgets: [{ id: 'removed.widget', hidden: false, size: null }],
    };
    const arranged = arrangeWidgets(declared, layout);
    expect(arranged.map((widget) => widget.id)).toEqual(declared.map((widget) => widget.id));
    expect(arranged.find((widget) => widget.id === 'music.now-playing')?.hidden).toBe(true);
  });
});

describe('resolveLayout', () => {
  const own: Layout = { hiddenSections: ['games'], widgets: [] };
  const shared: Layout = { hiddenSections: ['music'], widgets: [] };

  it('prefers the device while its layout is the newer one', () => {
    const account = { layout: shared, everywhereAt: '2026-10-02T10:00:00.000Z' };
    expect(resolveLayout({ layout: own, savedAt: '2026-10-02T11:00:00.000Z' }, account)).toBe(own);
    expect(resolveLayout({ layout: own, savedAt: '2026-10-02T09:00:00.000Z' }, account)).toBe(
      shared,
    );
    expect(resolveLayout(null, null)).toBe(DEFAULT_LAYOUT);
  });
});
