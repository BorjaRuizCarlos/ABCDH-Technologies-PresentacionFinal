import { api } from './api';
import type {
  ApiTask,
  ApiTaskStatus,
  ApiTaskPriority,
  ApiTaskComment,
  ApiBoard,
  ApiTaskWarning,
  ApiTaskAssignment,
  ApiBoardColumn,
  ApiSprint,
  ApiSprintBoard,
  ApiMilestone,
  ApiTag,
  ApiSubtask,
} from './types';

export interface CreateTaskPayload {
  project: number;
  board_column: number | null;
  title: string;
  description?: string;
  status?: number;
  priority?: number;
  created_by?: number;
  assigned_to?: number;
  start_date?: string;  // YYYY-MM-DD
  due_date?: string;    // YYYY-MM-DD
  sprint?: number | null;
  milestone?: number | null;
  tags?: number[];
  scrum_number?: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  status?: number | null;
  priority?: number | null;
  assigned_to?: number | null;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  sprint?: number | null;
  board_column?: number | null;
  milestone?: number | null;
  tags?: number[];
  scrum_number?: string | null;
}

export interface UpdateTaskCommentPayload {
  content: string;
}

export interface CreateTaskAssignmentPayload {
  task: number;
  assigned_to: number;
}

export interface UpdateTaskAssignmentPayload {
  task?: number;
  assigned_to?: number;
}

export const tasksService = {
  /** GET /api/tasks/ — optionally filter by board and/or project */
  list(
    boardId?: number,
    projectId?: number,
    filters?: {
      sprintId?: number;
      milestoneId?: number;
      boardColumnId?: number;
      tagId?: number;
    },
  ): Promise<ApiTask[]> {
    const params = new URLSearchParams();
    if (boardId) params.set('board', String(boardId));
    if (projectId) params.set('project', String(projectId));
    if (filters?.sprintId) params.set('sprint', String(filters.sprintId));
    if (filters?.milestoneId) params.set('milestone', String(filters.milestoneId));
    if (filters?.boardColumnId) params.set('board_column', String(filters.boardColumnId));
    if (filters?.tagId) params.set('tag', String(filters.tagId));
    const qs = params.toString();
    return api.get<ApiTask[]>(`/tasks/${qs ? `?${qs}` : ''}`);
  },

  /** GET /api/tasks/:id/ */
  get(id: number): Promise<ApiTask> {
    return api.get<ApiTask>(`/tasks/${id}/`);
  },

  /** POST /api/tasks/ */
  create(payload: CreateTaskPayload): Promise<ApiTask> {
    return api.post<ApiTask>('/tasks/', payload);
  },

  /** PATCH /api/tasks/:id/ */
  update(id: number, payload: UpdateTaskPayload): Promise<ApiTask> {
    return api.patch<ApiTask>(`/tasks/${id}/`, payload);
  },

  /** DELETE /api/tasks/:id/ */
  delete(id: number): Promise<void> {
    return api.delete<void>(`/tasks/${id}/`);
  },

  // ── Lookup tables ──────────────────────────────────────────────
  listStatuses(): Promise<ApiTaskStatus[]> {
    return api.get<ApiTaskStatus[]>('/task-statuses/');
  },

  listPriorities(): Promise<ApiTaskPriority[]> {
    return api.get<ApiTaskPriority[]>('/task-priorities/');
  },

  // ── Comments ───────────────────────────────────────────────────
  listComments(taskId: number): Promise<ApiTaskComment[]> {
    return api.get<ApiTaskComment[]>(`/task-comments/?task=${taskId}`);
  },

  addComment(taskId: number, content: string, userId?: number): Promise<ApiTaskComment> {
    return api.post<ApiTaskComment>('/task-comments/', {
      task: taskId,
      content,
      ...(typeof userId === 'number' && userId > 0 ? { user: userId } : {}),
    });
  },

  updateComment(commentId: number, payload: UpdateTaskCommentPayload): Promise<ApiTaskComment> {
    return api.patch<ApiTaskComment>(`/task-comments/${commentId}/`, payload);
  },

  deleteComment(commentId: number): Promise<void> {
    return api.delete<void>(`/task-comments/${commentId}/`);
  },

  // ── Boards ─────────────────────────────────────────────────────
  listBoards(projectId?: number): Promise<ApiBoard[]> {
    const url = projectId ? `/boards/?project=${projectId}` : '/boards/';
    return api.get<ApiBoard[]>(url);
  },

  createBoard(projectId: number, payload: {
    name: string;
    description?: string;
    coding_style?: string;
    review_focus?: string;
    tech_stack?: string;
    naming_convention?: string;
    response_language?: string;
    custom_instructions?: string;
  }): Promise<ApiBoard> {
    return api.post<ApiBoard>('/boards/', { project: projectId, ...payload });
  },

  updateBoard(id: number, payload: {
    name?: string;
    description?: string | null;
    coding_style?: string;
    review_focus?: string;
    tech_stack?: string;
    naming_convention?: string;
    response_language?: string;
    custom_instructions?: string | null;
  }): Promise<ApiBoard> {
    return api.patch<ApiBoard>(`/boards/${id}/`, payload);
  },

  deleteBoard(id: number): Promise<void> {
    return api.delete<void>(`/boards/${id}/`);
  },

  // ── Board columns ─────────────────────────────────────────────
  listBoardColumns(boardId?: number): Promise<ApiBoardColumn[]> {
    const url = boardId ? `/board-columns/?board=${boardId}` : '/board-columns/';
    return api.get<ApiBoardColumn[]>(url);
  },

  createBoardColumn(payload: { board: number; name: string; order: number; is_final?: boolean; is_review?: boolean }): Promise<ApiBoardColumn> {
    return api.post<ApiBoardColumn>('/board-columns/', payload);
  },

  updateBoardColumn(id: number, payload: { name?: string; order?: number; is_final?: boolean; is_review?: boolean }): Promise<ApiBoardColumn> {
    return api.patch<ApiBoardColumn>(`/board-columns/${id}/`, payload);
  },

  deleteBoardColumn(id: number): Promise<void> {
    return api.delete<void>(`/board-columns/${id}/`);
  },

  // ── Sprints ───────────────────────────────────────────────────
  listSprints(projectId?: number): Promise<ApiSprint[]> {
    const url = projectId ? `/sprints/?project=${projectId}` : '/sprints/';
    return api.get<ApiSprint[]>(url);
  },

  createSprint(payload: {
    project: number;
    name: string;
    start_date?: string;
    end_date?: string;
    status?: 'planned' | 'active' | 'closed';
  }): Promise<ApiSprint> {
    return api.post<ApiSprint>('/sprints/', payload);
  },

  updateSprint(id: number, payload: {
    name?: string;
    start_date?: string | null;
    end_date?: string | null;
    status?: 'planned' | 'active' | 'closed';
  }): Promise<ApiSprint> {
    return api.patch<ApiSprint>(`/sprints/${id}/`, payload);
  },

  deleteSprint(id: number): Promise<void> {
    return api.delete<void>(`/sprints/${id}/`);
  },

  // ── Sprint boards ─────────────────────────────────────────────
  listSprintBoards(sprintId?: number): Promise<ApiSprintBoard[]> {
    const url = sprintId ? `/sprint-boards/?sprint=${sprintId}` : '/sprint-boards/';
    return api.get<ApiSprintBoard[]>(url);
  },

  createSprintBoard(payload: { sprint: number; board: number }): Promise<ApiSprintBoard> {
    return api.post<ApiSprintBoard>('/sprint-boards/', payload);
  },

  deleteSprintBoard(id: number): Promise<void> {
    return api.delete<void>(`/sprint-boards/${id}/`);
  },

  // ── Milestones ────────────────────────────────────────────────
  listMilestones(projectId?: number): Promise<ApiMilestone[]> {
    const url = projectId ? `/milestones/?project=${projectId}` : '/milestones/';
    return api.get<ApiMilestone[]>(url);
  },

  createMilestone(payload: {
    project: number;
    name: string;
    description?: string;
    due_date?: string;
    is_completed?: boolean;
  }): Promise<ApiMilestone> {
    return api.post<ApiMilestone>('/milestones/', payload);
  },

  updateMilestone(id: number, payload: {
    name?: string;
    description?: string | null;
    due_date?: string | null;
    is_completed?: boolean;
  }): Promise<ApiMilestone> {
    return api.patch<ApiMilestone>(`/milestones/${id}/`, payload);
  },

  deleteMilestone(id: number): Promise<void> {
    return api.delete<void>(`/milestones/${id}/`);
  },

  // ── Tags ──────────────────────────────────────────────────────
  listTags(projectId?: number): Promise<ApiTag[]> {
    const url = projectId ? `/tags/?project=${projectId}` : '/tags/';
    return api.get<ApiTag[]>(url);
  },

  createTag(payload: { project: number; name: string; color?: string }): Promise<ApiTag> {
    return api.post<ApiTag>('/tags/', payload);
  },

  updateTag(id: number, payload: { name?: string; color?: string }): Promise<ApiTag> {
    return api.patch<ApiTag>(`/tags/${id}/`, payload);
  },

  deleteTag(id: number): Promise<void> {
    return api.delete<void>(`/tags/${id}/`);
  },

  // ── Task assignments ────────────────────────────────────────────
  listAssignments(taskId?: number): Promise<ApiTaskAssignment[]> {
    const url = taskId ? `/task-assignments/?task=${taskId}` : '/task-assignments/';
    return api.get<ApiTaskAssignment[] | { results: ApiTaskAssignment[] }>(url).then(
      (res) => Array.isArray(res) ? res : ((res as { results?: ApiTaskAssignment[] }).results ?? []),
    );
  },

  createAssignment(payload: CreateTaskAssignmentPayload): Promise<ApiTaskAssignment> {
    return api.post<ApiTaskAssignment>('/task-assignments/', payload);
  },

  getAssignment(id: number): Promise<ApiTaskAssignment> {
    return api.get<ApiTaskAssignment>(`/task-assignments/${id}/`);
  },

  updateAssignment(id: number, payload: UpdateTaskAssignmentPayload): Promise<ApiTaskAssignment> {
    return api.patch<ApiTaskAssignment>(`/task-assignments/${id}/`, payload);
  },

  deleteAssignment(id: number): Promise<void> {
    return api.delete<void>(`/task-assignments/${id}/`);
  },

  // ── Warnings ───────────────────────────────────────────────────
  listWarnings(filters?: { task_id?: number; project_id?: number; status?: 'active' | 'resolved' }): Promise<ApiTaskWarning[]> {
    const params = new URLSearchParams();
    if (filters?.task_id) params.set('task_id', String(filters.task_id));
    if (filters?.project_id) params.set('project_id', String(filters.project_id));
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString();
    return api.get<ApiTaskWarning[]>(`/task-warnings/${qs ? `?${qs}` : ''}`);
  },

  /** PATCH /api/task-warnings/:id — e.g. mark resolved */
  updateWarning(id: number, payload: { status?: 'active' | 'resolved'; resolved_at?: string | null }): Promise<ApiTaskWarning> {
    return api.patch<ApiTaskWarning>(`/task-warnings/${id}/`, payload);
  },

  /** DELETE /api/task-warnings/:id */
  deleteWarning(id: number): Promise<void> {
    return api.delete<void>(`/task-warnings/${id}/`);
  },

  // ── Subtasks ───────────────────────────────────────────────────
  /** GET /api/subtasks/ — optionally filter by parent task */
  listSubtasks(parentTaskId?: number): Promise<ApiSubtask[]> {
    const url = parentTaskId ? `/subtasks/?parent_task=${parentTaskId}` : '/subtasks/';
    return api.get<ApiSubtask[] | { results: ApiSubtask[] }>(url).then((res) => {
      const list = Array.isArray(res) ? res : (res?.results ?? []);
      // Enforce the parent filter client-side — the backend may ignore the query param.
      return parentTaskId != null ? list.filter((s) => s.parent_task === parentTaskId) : list;
    });
  },

  createSubtask(payload: { parent_task: number; title: string; description?: string; order?: number; is_completed?: boolean }): Promise<ApiSubtask> {
    return api.post<ApiSubtask>('/subtasks/', payload);
  },

  updateSubtask(id: number, payload: { title?: string; description?: string | null; order?: number; is_completed?: boolean }): Promise<ApiSubtask> {
    return api.patch<ApiSubtask>(`/subtasks/${id}/`, payload);
  },

  deleteSubtask(id: number): Promise<void> {
    return api.delete<void>(`/subtasks/${id}/`);
  },
};
