import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Project, ProjectInput } from '@pd/contracts';

/** Projects are available to all modules: for example, finance uses them as "wallets". */
@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly http = inject(HttpClient);

  /** Reactive list; call it in a component field, refresh with `.reload()`. */
  list() {
    return httpResource<Project[]>(() => '/api/projects', { defaultValue: [] });
  }

  create(input: ProjectInput) {
    return this.http.post<Project>('/api/projects', input);
  }

  update(id: string, input: ProjectInput) {
    return this.http.put<Project>(`/api/projects/${id}`, input);
  }

  remove(id: string) {
    return this.http.delete<void>(`/api/projects/${id}`);
  }
}
