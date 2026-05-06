import { api } from './api';
import type { ApiProject } from './types';

export interface ApiSprint {
  id_sprint: number;
  project: number;
  name: string;
  goal?: string | null;
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
  created_at: string;
}

export interface CreateSprintPayload {
  project: number;
  name: string;
  goal?: string;
  start_date?: string | null;
  end_date?: string | null;
}

export const sprintsService = {
  list(projectId?: number): Promise<ApiSprint[]> {
    const url = projectId ? `/sprints/?project=${projectId}` : '/sprints/';
    return api.get<ApiSprint[]>(url);
  },

  get(id: number): Promise<ApiSprint> {
    return api.get<ApiSprint>(`/sprints/${id}/`);
  },

  create(payload: CreateSprintPayload): Promise<ApiSprint> {
    return api.post<ApiSprint>('/sprints/', payload);
  },

  update(id: number, payload: Partial<CreateSprintPayload>): Promise<ApiSprint> {
    return api.patch<ApiSprint>(`/sprints/${id}/`, payload);
  },

  delete(id: number): Promise<void> {
    return api.delete<void>(`/sprints/${id}/`);
  },
};

export default sprintsService;
