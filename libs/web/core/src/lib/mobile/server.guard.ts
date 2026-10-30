import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {isMobileApp, mobileServer} from './mobile-app';

/** The Android app before a server is chosen: everything waits for the connect page. */
export const serverGuard: CanActivateFn = () =>
  !isMobileApp() ||
  mobileServer() !== null ||
  inject(Router).createUrlTree(['/connect']);
