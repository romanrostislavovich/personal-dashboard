import { httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CORE_READS, projectsApi } from '@pd/client-core';
import { Project, ProjectInput } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { fromCore } from '../client/core-requests';

/** Projects are available to all modules: for example, finance uses them as "wallets". */
@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly projects = projectsApi(inject(DASHBOARD_CLIENT).api);

  /** Reactive list; call it in a component field, refresh with `.reload()`. */
  list() {
    return httpResource<Project[]>(() => CORE_READS.projects(), { defaultValue: [] });
  }

  create(input: ProjectInput) {
    return fromCore(() => this.projects.create(input));
  }

  update(id: string, input: ProjectInput) {
    return fromCore(() => this.projects.update(id, input));
  }

  remove(id: string) {
    return fromCore(() => this.projects.remove(id));
  }
}
