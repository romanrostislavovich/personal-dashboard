import { z } from 'zod';

/** How many columns of the home grid a widget takes. */
export const WIDGET_SIZES = ['small', 'medium', 'large'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

/**
 * What the user made of the dashboard: which sections are out of the menu, and the widgets of
 * the home page — their order, which are hidden, their sizes.
 */
export const layoutSchema = z.object({
  /** Ids of the modules left out of the menu and the home page. Their data keeps coming. */
  hiddenSections: z.array(z.string().max(60)).max(100),
  /** In the order they are shown; a widget that is not listed comes after them as it is. */
  widgets: z
    .array(
      z.object({
        id: z.string().max(100),
        hidden: z.boolean(),
        /** `null` — the size the module gave it. */
        size: z.enum(WIDGET_SIZES).nullable(),
      }),
    )
    .max(200),
});
export type Layout = z.infer<typeof layoutSchema>;

export const DEFAULT_LAYOUT: Layout = { hiddenSections: [], widgets: [] };

/** The layout of the account: what every device shows unless it has a newer one of its own. */
export interface AccountLayout {
  layout: Layout;
  /** When it was applied everywhere (ISO). */
  everywhereAt: string;
}

/** A layout chosen on one device, kept by that device. */
export interface DeviceLayout {
  layout: Layout;
  /** When it was chosen (ISO). */
  savedAt: string;
}

/** The same rule as for themes (`resolveTheme`): the device's own while it is the newer one. */
export function resolveLayout(device: DeviceLayout | null, account: AccountLayout | null): Layout {
  if (device && (!account || device.savedAt > account.everywhereAt)) {
    return device.layout;
  }
  return account?.layout ?? DEFAULT_LAYOUT;
}

/** A widget as its module declares it; the module is the part of the id before the dot. */
export interface DeclaredWidget {
  id: string;
  size: WidgetSize;
}

export interface ArrangedWidget extends DeclaredWidget {
  hidden: boolean;
}

/** `music.now-playing` → `music` */
export function widgetSection(id: string): string {
  return id.split('.')[0];
}

/**
 * The widgets of the home page under a layout: the listed ones first, in the layout's order,
 * then the ones it does not know (a new module, a new widget) as declared. A widget of a hidden
 * section is hidden too. Ids the layout remembers but the app no longer has are dropped.
 */
export function arrangeWidgets(declared: DeclaredWidget[], layout: Layout): ArrangedWidget[] {
  const byId = new Map(declared.map((widget) => [widget.id, widget]));
  const hiddenSections = new Set(layout.hiddenSections);
  const arranged: ArrangedWidget[] = [];
  for (const saved of layout.widgets) {
    const widget = byId.get(saved.id);
    if (widget) {
      byId.delete(saved.id);
      arranged.push({ id: widget.id, size: saved.size ?? widget.size, hidden: saved.hidden });
    }
  }
  for (const widget of byId.values()) {
    arranged.push({ ...widget, hidden: false });
  }
  return arranged.map((widget) => ({
    ...widget,
    hidden: widget.hidden || hiddenSections.has(widgetSection(widget.id)),
  }));
}
