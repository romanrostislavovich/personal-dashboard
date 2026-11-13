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
  keepPlaceOnFocus(row);
  new ResizeObserver(update).observe(row);
  update();
  // Material's paging brought the chosen tab into view; the native scroll has to do it itself,
  // or a page opened on a far tab (/health/band on a phone) shows a row without it. Only when
  // another tab becomes active: a touch changes classes too (the ripple), and rolling back to the
  // current tab under the finger lost the tap on a row swiped away from it.
  let shown: Element | null = null;
  const reveal = () => {
    const active = row.querySelector('.mdc-tab--active');
    if (active !== shown) {
      shown = active;
      revealActive(row);
    }
  };
  new MutationObserver(reveal).observe(row, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  reveal();
}

/**
 * Material resets the row's scroll to the start whenever a tab gets the focus (its own paging
 * assumes the row never scrolls natively). A tap on a row swiped away from the start focused the
 * tab, the row jumped back, and the click landed on whatever came under the finger — a tab took a
 * second tap (2026-11, seen on the phone). The row keeps its place; a tab reached by the keyboard
 * is rolled into view instead.
 */
function keepPlaceOnFocus(row: HTMLElement): void {
  let kept = row.scrollLeft;
  // A scroll event comes a frame later: Material's reset is not in `kept` yet at the focus.
  row.addEventListener('scroll', () => (kept = row.scrollLeft), {
    passive: true,
  });
  row.addEventListener('focusin', event => {
    if (row.scrollLeft !== kept) {
      row.scrollLeft = kept;
    }
    const tab = event.target;
    if (tab instanceof HTMLElement && !wholly(row, tab)) {
      row.scrollTo({
        left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2,
      });
    }
  });
}

/** Whether the tab is wholly seen in the row. */
function wholly(row: HTMLElement, tab: HTMLElement): boolean {
  return (
    tab.offsetLeft >= row.scrollLeft &&
    tab.offsetLeft + tab.offsetWidth <= row.scrollLeft + row.clientWidth
  );
}

/** The active tab is rolled to the middle of the row when it is not wholly seen. */
function revealActive(row: HTMLElement): void {
  const tab = row.querySelector<HTMLElement>('.mdc-tab--active');
  if (!tab) {
    return;
  }
  if (!wholly(row, tab)) {
    row.scrollTo({
      left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2,
    });
  }
}
