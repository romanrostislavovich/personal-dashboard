import {DOCUMENT} from '@angular/common';
import {inject, Provider} from '@angular/core';
import {MAT_TABS_CONFIG} from '@angular/material/tabs';

/** The row of tabs as Material draws it, scrolled natively instead of by its own paging. */
const TAB_ROW = '.mat-mdc-tab-label-container, .mat-mdc-tab-link-container';
/** A click on an arrow rolls the row by this share of its width. */
const STEP = 0.7;

/**
 * Tabs that scroll like any row: a finger swipes them on a phone, a wheel or a touchpad rolls them
 * on a computer, and the < > arrows roll them a step. Material's own paging (arrows that move the
 * row by a transform, which a swipe cannot follow) is off for every tab group and nav bar; the
 * arrows here roll the native scroll instead. The row's CSS is in apps/web/src/styles.scss.
 */
export const provideScrollableTabs = (): Provider => ({
  provide: MAT_TABS_CONFIG,
  useValue: {disablePagination: true},
});

/** Wheel over the tabs, and the arrows on every row of tabs that appears. */
export function startScrollableTabs(): void {
  const document = inject(DOCUMENT);
  const view = document.defaultView;
  if (!view) {
    return;
  }
  // A mouse wheel turned over a row of tabs rolls it sideways (a touchpad does so by itself).
  document.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      const row = (event.target as Element | null)?.closest?.(TAB_ROW);
      if (
        !(row instanceof HTMLElement) ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
        row.scrollWidth <= row.clientWidth
      ) {
        return;
      }
      row.scrollLeft += event.deltaY;
      event.preventDefault();
    },
    {passive: false},
  );
  const arm = () =>
    document
      .querySelectorAll<HTMLElement>(TAB_ROW)
      .forEach(row => withArrows(row));
  new view.MutationObserver(arm).observe(document.body, {
    childList: true,
    subtree: true,
  });
  arm();
}

/** Two arrows beside a row, each shown only while the row can roll its way. */
function withArrows(row: HTMLElement): void {
  if (row.dataset['pdArrows'] || !row.parentElement) {
    return;
  }
  row.dataset['pdArrows'] = '1';
  const document = row.ownerDocument;
  const arrow = (side: 'left' | 'right') => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pd-tab-arrow pd-tab-arrow-${side}`;
    button.tabIndex = -1;
    button.setAttribute('aria-hidden', 'true');
    button.innerHTML = `<span class="material-symbols-rounded">chevron_${side}</span>`;
    button.addEventListener('click', () =>
      row.scrollBy({
        left: (side === 'left' ? -1 : 1) * row.clientWidth * STEP,
        behavior: 'smooth',
      }),
    );
    return button;
  };
  const left = arrow('left');
  const right = arrow('right');
  row.parentElement.insertBefore(left, row);
  row.parentElement.insertBefore(right, row.nextSibling);
  const update = () => {
    left.hidden = row.scrollLeft <= 1;
    right.hidden = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;
  };
  row.addEventListener('scroll', update, {passive: true});
  new ResizeObserver(update).observe(row);
  update();
  // Material's paging brought the chosen tab into view; the native scroll has to do it itself,
  // or a page opened on a far tab (/health/band on a phone) shows a row without it.
  const reveal = () => revealActive(row);
  new MutationObserver(reveal).observe(row, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  reveal();
}

/** The active tab is rolled to the middle of the row when it is not wholly seen. */
function revealActive(row: HTMLElement): void {
  const tab = row.querySelector<HTMLElement>('.mdc-tab--active');
  if (!tab) {
    return;
  }
  const seen =
    tab.offsetLeft >= row.scrollLeft &&
    tab.offsetLeft + tab.offsetWidth <= row.scrollLeft + row.clientWidth;
  if (!seen) {
    row.scrollTo({
      left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2,
    });
  }
}
