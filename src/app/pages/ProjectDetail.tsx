import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  ArrowLeft, Calendar, Users, Clock, CheckCircle2,
  AlertTriangle, UserPlus, RefreshCw, List, Trash2, Settings2, Pencil, Flag, Check, X as XIcon, Plus,
  GripVertical, TrendingDown, Gauge, Trophy, Loader2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  DndContext, closestCenter, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StatusBadge } from '../components/StatusBadge';
import { DatePickerField } from '../components/DatePickerField';
import { KPICard } from '../components/KPICard';
import { CommandBar } from '../components/CommandBar';
import { ADOTabs } from '../components/ADOTabs';
import { AvatarGroup } from '../components/AvatarGroup';
import { ProgressBar } from '../components/ProgressBar';
import { AssignResponsibleModal, type AssignCandidate } from '../components/AssignResponsibleModal';
import { AddMemberModal } from '../components/AddMemberModal';
import {
  useApiBoards, useApiBoardColumns, useApiProjectMembers, useApiUsers, useApiTasks, useApiRoles, useApiSprints, useApiMilestones, useApiLeaderboard, useApiTags,
} from '../hooks/useProjectData';
import { Leaderboard } from '../components/Gamification';
import { projectsService, tasksService, usersService } from '../../services';
import type { ApiProject, ApiProjectMember, ApiTask, ApiTaskAssignment, ApiUserAccount } from '../../services';
import { getProjectHealth, type ProjectHealth } from '../utils/projectHealth';
import { buildBurndownSeries, parseStoryPoints } from '../utils/burndown';
import { useAuth } from '../context/AuthContext';
import { GitHubReposView } from '../components/GitHubReposView';
import { CodeReviewPanel } from '../components/CodeReviewPanel';
import { ProjectTasksWorkspace } from '../components/ProjectTasksWorkspace.tsx';
import { ScrumPokerPanel } from '../components/ScrumPokerPanel';
import Timeline from '../components/Timeline';
import { getProjectStatusApiValue, getProjectStatusBadge, getProjectStatusLabel, normalizeProjectStatus, PROJECT_STATUS_OPTIONS } from '../utils/projectStatus';
import { formatProjectDate, getProjectTimeRemainingLabel } from '../utils/projectDates';
import {
  canEditMemberProjectRole,
  getAllowedProjectRoleIdsForUser,
  getProjectCapabilities,
  getProjectRoleIds,
  getUserGithubConnectionState,
  isStakeholderSystemUser,
} from '../utils/projectPermissions';

// Sortable wrapper for a milestone row (drag-and-drop reordering in edit mode).
function SortableMilestone({
  id,
  disabled,
  children,
}: {
  id: number;
  disabled: boolean;
  // dnd-kit's attribute/listener types aren't index-signature compatible, so keep this loose.
  children: (handle: { attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = { attributes: attributes as unknown as Record<string, unknown>, listeners: listeners as unknown as Record<string, unknown> | undefined };
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, position: 'relative', zIndex: isDragging ? 10 : undefined }}
    >
      {children(handle)}
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const projectId = Number(id) || 0;

  // ── Project ──────────────────────────────────────────────────────────────
  const [project, setProject] = useState<ApiProject | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [savingProjectConfig, setSavingProjectConfig] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [projectStatus, setProjectStatus] = useState('planning');
  const [projectStartDate, setProjectStartDate] = useState('');
  const [projectEndDate, setProjectEndDate] = useState('');

  useEffect(() => {
    if (!projectId) return;
    setLoadingProject(true);
    setProjectError(null);
    projectsService.get(projectId)
      .then(setProject)
      .catch(() => setProjectError('No se pudo cargar el proyecto.'))
      .finally(() => setLoadingProject(false));
  }, [projectId]);

  useEffect(() => {
    setProjectStatus(normalizeProjectStatus(project?.status) ?? 'planning');
    setProjectStartDate(project?.start_date ?? '');
    setProjectEndDate(project?.end_date ?? '');
  }, [project?.status, project?.start_date, project?.end_date]);

  // ── Boards ───────────────────────────────────────────────────────────────
  const { data: boards, loading: loadingBoards, refetch: refetchBoards } = useApiBoards(projectId);
  const [selectedBoardId, setSelectedBoardId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (boards && boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0].id_board);
    }
  }, [boards, selectedBoardId]);
  // ── Sprints (for project end date validation) ─────────────────────────────
  const { data: sprints } = useApiSprints(projectId);

  // ── Gamification leaderboard (Team tab) ───────────────────────────────────
  const { data: leaderboard, loading: loadingLeaderboard } = useApiLeaderboard({ project: projectId });
  const currentUserNumericId = useMemo(() => {
    const parsed = Number(user?.id ?? 0);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
  }, [user]);

  // ── Board columns (to detect "done" tasks sitting in a final column) ───────
  const { data: boardColumns } = useApiBoardColumns();
  const projectBoardIds = useMemo(() => new Set((boards ?? []).map((b) => b.id_board)), [boards]);
  const finalColumnIds = useMemo(
    () => new Set((boardColumns ?? []).filter((c) => projectBoardIds.has(c.board) && c.is_final).map((c) => c.id_column)),
    [boardColumns, projectBoardIds],
  );

  // ── Milestones (for overview) ─────────────────────────────────────────────
  const { data: overviewMilestones, refetch: refetchMilestones } = useApiMilestones(projectId);
  const [milestonesEditing, setMilestonesEditing] = useState(false);
  const [milestoneSaving, setMilestoneSaving] = useState<number | null>(null);
  const [showAddMilestoneForm, setShowAddMilestoneForm] = useState(false);
  const [newMilestoneDraft, setNewMilestoneDraft] = useState({ name: '', description: '', due_date: '' });
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [editingMilestoneId, setEditingMilestoneId] = useState<number | null>(null);
  const [editMilestoneDraft, setEditMilestoneDraft] = useState<{ name: string; description: string; due_date: string } | null>(null);
  const [deletingMilestone, setDeletingMilestone] = useState<number | null>(null);
  // Custom milestone ordering (drag-and-drop). Persisted locally per project since the
  // API has no order field; falls back to creation order for any unseen milestone.
  const milestoneOrderKey = `pip_milestone_order_${projectId}`;
  const [milestoneOrder, setMilestoneOrder] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(`pip_milestone_order_${projectId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
    } catch {
      return [];
    }
  });
  const sortedMilestones = useMemo(() => {
    const list = overviewMilestones ?? [];
    const orderIndex = new Map(milestoneOrder.map((id, i) => [id, i] as const));
    return [...list].sort((a, b) => {
      const ai = orderIndex.get(a.id_milestone) ?? Number.POSITIVE_INFINITY;
      const bi = orderIndex.get(b.id_milestone) ?? Number.POSITIVE_INFINITY;
      if (ai !== bi) return ai - bi;
      return a.id_milestone - b.id_milestone;
    });
  }, [overviewMilestones, milestoneOrder]);
  const handleMilestoneDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = sortedMilestones.map((m) => m.id_milestone);
    const oldIndex = ids.indexOf(Number(active.id));
    const newIndex = ids.indexOf(Number(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    setMilestoneOrder(next);
    try {
      localStorage.setItem(milestoneOrderKey, JSON.stringify(next));
    } catch { /* ignore storage failures */ }
  };
  const latestSprintEndDate = useMemo(() => {
    const dates = (sprints ?? [])
      .map((s) => s.end_date)
      .filter((d): d is string => d != null)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }, [sprints]);
  // ── Tasks ─────────────────────────────────────────────────────────────────
  const { statuses, refetch: refetchTasks } = useApiTasks(selectedBoardId, projectId);
  const { data: allProjectTasks, refetch: refetchAllProjectTasks } = useApiTasks(undefined, projectId);
  const { data: projectTags } = useApiTags(projectId);

  // ── Members + Users ───────────────────────────────────────────────────────
  const { data: members, loading: loadingMembers, refetch: refetchMembers } = useApiProjectMembers(projectId);
  const { data: users, loading: loadingUsers } = useApiUsers();
  const { data: roles } = useApiRoles();

  const currentUserId = Number(user?.id ?? 0);
  const currentUserAccount = useMemo(
    () => (users ?? []).find((candidate) => candidate.id_user === currentUserId) ?? null,
    [users, currentUserId],
  );
  const currentUserMember = useMemo(
    () => (members ?? []).find((member) => member.user === currentUserId) ?? null,
    [members, currentUserId],
  );
  const projectRoleIds = useMemo(() => getProjectRoleIds(roles), [roles]);
  const capabilities = useMemo(
    () => getProjectCapabilities(currentUserMember, currentUserAccount, projectRoleIds),
    [currentUserAccount, currentUserMember, projectRoleIds],
  );
  const canAccessProject = capabilities.canAccessProject;
  const canManageProject = capabilities.canManageProject;
  const canManageMembers = capabilities.canManageMembers;
  const canEditMemberRoles = capabilities.canEditMemberRoles;
  const canManageTasks = capabilities.canManageTasks;
  const canCreateRepos = capabilities.canCreateRepos;
  const canEditMilestones = capabilities.isProjectManager || capabilities.isScrumMaster || capabilities.isProductOwner;

  const candidatesToAdd = useMemo(() => {
    if (!users) return [];
    const memberIds = new Set((members ?? []).map((m) => m.user));
    return users.filter((u) => !memberIds.has(u.id_user));
  }, [users, members]);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [bypassGithubCheck, setBypassGithubCheck] = useState(false);
  const handleAddMember = async (userId: number, roleId: number | null) => {
    if (!canManageMembers) {
      throw new Error('Solo el Project Manager puede agregar miembros.');
    }
    const selectedUser = (users ?? []).find((candidate) => candidate.id_user === userId) ?? null;
    const allowedRoleIds = getAllowedProjectRoleIdsForUser(selectedUser, projectRoleIds);
    const githubState = getUserGithubConnectionState(selectedUser);

    if (roleId == null) {
      throw new Error('Debes seleccionar un rol antes de agregar a la persona.');
    }
    if (!allowedRoleIds.includes(roleId)) {
      throw new Error(isStakeholderSystemUser(selectedUser)
        ? 'Los Stakeholders solo pueden entrar con rol Stakeholder.'
        : 'Debes asignar Product Owner, Scrum Master o Developer.');
    }
    if (!bypassGithubCheck && !isStakeholderSystemUser(selectedUser) && githubState.connected !== true) {
      throw new Error('No puedes agregar a esta persona porque GitHub no esta conectado o no se pudo verificar.');
    }
    try {
      await usersService.addMember(projectId, userId, roleId ?? undefined);
      toast.success('Miembro agregado');
      refetchMembers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo agregar el miembro';
      toast.error(msg);
      throw err;
    }
  };

  const userMap = useMemo(() => {
    const m = new Map<number, string>();
    (users ?? []).forEach((u) => m.set(u.id_user, u.username));
    return m;
  }, [users]);

  const roleMap = useMemo(() => {
    const m = new Map<number, string>();
    (roles ?? []).forEach((r) => m.set(r.id_role, r.name));
    return m;
  }, [roles]);

  const projectRoleOptions = useMemo(
    () => (roles ?? []).filter((role) => getAllowedProjectRoleIdsForUser(null, projectRoleIds).includes(role.id_role) || role.id_role === projectRoleIds.stakeholderId),
    [projectRoleIds, roles],
  );

  const memberUserMap = useMemo(() => {
    const nextMap = new Map<number, ApiUserAccount>();
    (users ?? []).forEach((candidate) => nextMap.set(candidate.id_user, candidate));
    return nextMap;
  }, [users]);

  const doneStatusIds = useMemo(() => {
    const normalizedDoneNames = new Set(['done', 'completada', 'completado']);
    return new Set(
      statuses
        .filter((s) => normalizedDoneNames.has(s.name.trim().toLowerCase()))
        .map((s) => s.id_status),
    );
  }, [statuses]);

  // A task counts as done if it's explicitly completed, sits in a board's final
  // column, or has a "done" status — so the progress matches what the board shows.
  const isTaskDone = useCallback(
    (t: ApiTask) =>
      t.completed_at != null
      || finalColumnIds.has(t.board_column)
      || (t.status != null && doneStatusIds.has(t.status)),
    [finalColumnIds, doneStatusIds],
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const tList = allProjectTasks ?? [];
    const now = new Date();
    const total = tList.length;
    const completed = tList.filter(isTaskDone).length;
    const overdue = tList.filter(
      (t) => !isTaskDone(t) && t.due_date && new Date(t.due_date) < now,
    ).length;
    const memberCount = (members ?? []).length;
    return { total, completed, overdue, memberCount };
  }, [allProjectTasks, members, isTaskDone]);

  // ── Project health, story-point risk & burndown (overview) ─────────────────
  const projectAnalytics = useMemo(() => {
    const tList = allProjectTasks ?? [];
    const progress = {
      completed: kpis.completed,
      total: kpis.total,
      percentage: kpis.total > 0 ? Math.round((kpis.completed / kpis.total) * 100) : 0,
    };
    const health: ProjectHealth = project
      ? getProjectHealth({ created_at: project.created_at, end_date: project.end_date, status: project.status }, progress)
      : 'yellow';

    // Story points (scrum poker)
    const totalPoints = tList.reduce((s, t) => s + parseStoryPoints(t.scrum_number), 0);
    const donePoints = tList.filter(isTaskDone).reduce((s, t) => s + parseStoryPoints(t.scrum_number), 0);
    const pointsPct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;

    // Schedule elapsed (time-based expectation)
    const startTime = project?.start_date ? new Date(project.start_date).getTime() : (project?.created_at ? new Date(project.created_at).getTime() : null);
    const endTime = project?.end_date ? new Date(project.end_date).getTime() : null;
    const nowTime = Date.now();
    let elapsedPct: number | null = null;
    if (startTime != null && endTime != null && endTime > startTime) {
      elapsedPct = Math.round(Math.min(1, Math.max(0, (nowTime - startTime) / (endTime - startTime))) * 100);
    }
    // Risk: how far the (points) progress lags the schedule.
    const completionBasis = totalPoints > 0 ? pointsPct : progress.percentage;
    const shortfall = elapsedPct != null ? elapsedPct - completionBasis : 0;
    const riskLevel: 'low' | 'medium' | 'high' =
      elapsedPct == null ? 'low' : shortfall >= 35 ? 'high' : shortfall >= 15 ? 'medium' : 'low';

    return { progress, health, totalPoints, donePoints, pointsPct, elapsedPct, shortfall, riskLevel, completionBasis };
  }, [allProjectTasks, kpis.completed, kpis.total, isTaskDone, project]);

  // Burndown of the selected sprint (story points if available, else task count).
  const [overviewSprintId, setOverviewSprintId] = useState<number | null>(null);
  const burndownSprintOptions = useMemo(() => {
    const rank = (s: { status: string }) => (s.status === 'active' ? 0 : s.status === 'planned' ? 1 : 2);
    return [...(sprints ?? [])].sort((a, b) => {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (b.start_date ?? '').localeCompare(a.start_date ?? '');
    });
  }, [sprints]);
  const effectiveOverviewSprintId = overviewSprintId ?? burndownSprintOptions[0]?.id_sprint ?? null;
  const overviewSprint = useMemo(
    () => burndownSprintOptions.find((s) => s.id_sprint === effectiveOverviewSprintId) ?? null,
    [burndownSprintOptions, effectiveOverviewSprintId],
  );
  const burndownUsesPoints = useMemo(() => {
    if (!overviewSprint) return false;
    return (allProjectTasks ?? []).some((t) => t.sprint === overviewSprint.id_sprint && parseStoryPoints(t.scrum_number) > 0);
  }, [allProjectTasks, overviewSprint]);
  const burndownData = useMemo(() => {
    if (!overviewSprint) return [];
    const sprintTasks = (allProjectTasks ?? []).filter((t) => t.sprint === overviewSprint.id_sprint);
    return buildBurndownSeries(overviewSprint, sprintTasks, new Date(), burndownUsesPoints ? (t) => parseStoryPoints(t.scrum_number) : () => 1);
  }, [allProjectTasks, overviewSprint, burndownUsesPoints]);

  // ── Days remaining ───────────────────────────────────────────────────────
  const timeRemainingLabel = getProjectTimeRemainingLabel(project?.end_date ?? null, project?.status).label;
  const tomorrowDate = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return next.toISOString().slice(0, 10);
  }, []);
  const endDateMinDate = useMemo(() => {
    const base = projectStartDate || tomorrowDate;
    return latestSprintEndDate && latestSprintEndDate > base ? latestSprintEndDate : base;
  }, [projectStartDate, latestSprintEndDate, tomorrowDate]);
  const hasProjectConfigChanges =
    projectStatus !== (normalizeProjectStatus(project?.status) ?? 'planning') ||
    projectStartDate !== (project?.start_date ?? '') ||
    projectEndDate !== (project?.end_date ?? '');

  // ── Assign modal ─────────────────────────────────────────────────────────
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningResponsible, setAssigningResponsible] = useState(false);
  const currentProjectManagerMember = useMemo(
    () => (members ?? []).find((member) => member.role === projectRoleIds.projectManagerId) ?? null,
    [members, projectRoleIds.projectManagerId],
  );
  const assignCandidates: AssignCandidate[] = useMemo(
    () => (members ?? []).map((m) => ({
      id: m.user,
      name: userMap.get(m.user) ?? `Usuario #${m.user}`,
      email: `user${m.user}@platform`,
      role: roleMap.get(m.role ?? 0) ?? 'Sin rol',
    })),
    [members, userMap, roleMap],
  );
  // Stakeholders can see tasks but must NOT be assignable to them.
  const isStakeholderMember = (m: ApiProjectMember) =>
    m.role === projectRoleIds.stakeholderId || isStakeholderSystemUser(memberUserMap.get(m.user) ?? null);
  const assignableUsers = useMemo(
    () => (members ?? [])
      .filter((m) => !isStakeholderMember(m))
      .map((m) => ({ id: m.user, name: userMap.get(m.user) ?? `Usuario #${m.user}` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, userMap, memberUserMap, projectRoleIds.stakeholderId],
  );
  const handleAssign = async (userId: number) => {
    if (!canManageProject) {
      toast.error('No tienes permisos para reasignar al responsable del proyecto.');
      return;
    }

    const nextResponsibleMember = (members ?? []).find((member) => member.user === userId);
    if (!nextResponsibleMember) {
      toast.error('La persona seleccionada no pertenece al proyecto.');
      return;
    }

    if (currentProjectManagerMember?.user === userId) {
      setShowAssignModal(false);
      return;
    }

    setAssigningResponsible(true);
    try {
      await usersService.updateMember(nextResponsibleMember.id, { role: projectRoleIds.projectManagerId ?? undefined });

      if (currentProjectManagerMember) {
        await usersService.updateMember(currentProjectManagerMember.id, {
          role: projectRoleIds.developerId ?? undefined,
        });
      }

      await refetchMembers();
      const candidate = assignCandidates.find((x) => x.id === userId);
      if (candidate) toast.success(`Responsable asignado: ${candidate.name}`);
      setShowAssignModal(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo reasignar al responsable.';
      toast.error(msg);
    } finally {
      setAssigningResponsible(false);
    }
  };

  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);
  const [updatingMemberRoleId, setUpdatingMemberRoleId] = useState<number | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);

  const handleMemberRoleChange = async (memberId: number, nextRoleId: number) => {
    if (!canEditMemberRoles) {
      toast.error('Solo el Project Manager puede cambiar roles del proyecto.');
      return;
    }

    const member = (members ?? []).find((entry) => entry.id === memberId) ?? null;
    const memberUser = member ? memberUserMap.get(member.user) ?? null : null;
    const allowedRoleIds = getAllowedProjectRoleIdsForUser(memberUser, projectRoleIds);

    if (!member) {
      toast.error('No se encontró el miembro seleccionado.');
      return;
    }
    if (!canEditMemberProjectRole(memberUser, member, projectRoleIds)) {
      toast.error('Ese rol no se puede cambiar desde el proyecto.');
      return;
    }
    if (!allowedRoleIds.includes(nextRoleId)) {
      toast.error('Ese cambio de rol no está permitido.');
      return;
    }
    if (member.role === nextRoleId) {
      return;
    }

    setUpdatingMemberRoleId(memberId);
    try {
      await usersService.updateMember(memberId, { role: nextRoleId });
      await refetchMembers();
      toast.success('Rol del miembro actualizado.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar el rol del miembro.';
      toast.error(msg);
    } finally {
      setUpdatingMemberRoleId(null);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!canManageMembers) {
      toast.error('Solo el Project Manager puede eliminar miembros del proyecto.');
      return;
    }

    const member = (members ?? []).find((m) => m.id === memberId);
    if (!member) {
      toast.error('No se encontró el miembro seleccionado.');
      return;
    }

    if (member.role === projectRoleIds.projectManagerId) {
      toast.error('Reasigna primero al responsable del proyecto.');
      return;
    }

    if (!confirm('¿Eliminar este miembro del proyecto?')) {
      return;
    }

    setRemovingMemberId(memberId);
    try {
      const projectTasks = await tasksService.list(undefined, projectId);
      const allAssignments = (await Promise.all(
        projectTasks.map((task: ApiTask) => tasksService.listAssignments(task.id_task)),
      )).flat();
      const projectTaskIds = new Set(projectTasks.map((task: ApiTask) => task.id_task));
      const memberAssignments = allAssignments.filter(
        (assignment: ApiTaskAssignment) => projectTaskIds.has(assignment.task) && assignment.assigned_to === member.user,
      );

      if (memberAssignments.length > 0) {
        await Promise.all(memberAssignments.map((assignment: ApiTaskAssignment) => tasksService.deleteAssignment(assignment.id_assignment)));
      }

      const remainingAssignmentsByTask = allAssignments
        .filter((assignment: ApiTaskAssignment) => projectTaskIds.has(assignment.task) && assignment.assigned_to !== member.user)
        .reduce<Map<number, number[]>>((map: Map<number, number[]>, assignment: ApiTaskAssignment) => {
          const current = map.get(assignment.task) ?? [];
          current.push(assignment.assigned_to);
          map.set(assignment.task, current);
          return map;
        }, new Map());

      const legacyTasksToUpdate = projectTasks.filter((task: ApiTask) => task.assigned_to === member.user);
      if (legacyTasksToUpdate.length > 0) {
        await Promise.all(
          legacyTasksToUpdate.map((task: ApiTask) => tasksService.update(task.id_task, {
            assigned_to: remainingAssignmentsByTask.get(task.id_task)?.[0] ?? null,
          })),
        );
      }

      await usersService.removeMember(memberId);
      await refetchMembers();
      toast.success('Miembro eliminado del proyecto.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo eliminar el miembro.';
      toast.error(msg);
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleProjectStatusSave = async () => {
    if (!project) return;
    if (latestSprintEndDate && projectEndDate && projectEndDate < latestSprintEndDate) {
      toast.error(`La fecha de entrega no puede ser antes del fin del último sprint (${latestSprintEndDate}).`);
      return;
    }
    const apiStatus = getProjectStatusApiValue(projectStatus);
    if (!apiStatus) {
      toast.error('Estado de proyecto inválido.');
      return;
    }
    setSavingProjectConfig(true);
    try {
      const updated = await projectsService.update(project.id_project, {
        status: apiStatus,
        start_date: projectStartDate || undefined,
        end_date: projectEndDate || undefined,
      });
      setProject(updated);
      toast.success('Configuración del proyecto actualizada.');
    } catch {
      toast.error('No se pudo actualizar la configuración del proyecto.');
    } finally {
      setSavingProjectConfig(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    if (!confirm(`¿Eliminar el proyecto "${project.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setDeletingProject(true);
    try {
      await projectsService.delete(project.id_project);
      toast.success('Proyecto eliminado.');
      navigate('/projects');
    } catch {
      toast.error('No se pudo eliminar el proyecto.');
      setDeletingProject(false);
    }
  };

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const initialQueryTab = searchParams.get('tab');
  const initialQueryTaskId = Number(searchParams.get('task'));
  const normalizedInitialTaskId = Number.isNaN(initialQueryTaskId) || initialQueryTaskId <= 0 ? null : initialQueryTaskId;

  type ProjectWorkspaceTab = 'backlog' | 'sprints' | 'boards';

  const [activeTab, setActiveTab] = useState<'resumen' | ProjectWorkspaceTab | 'timeline' | 'code-review' | 'repositorios' | 'equipo' | 'scrum-poker' | 'configuracion'>(() => {
    if (initialQueryTab === 'tareas' || initialQueryTab === 'backlog') return 'backlog';
    if (initialQueryTab === 'sprints') return 'sprints';
    if (initialQueryTab === 'boards') return 'boards';
    if (initialQueryTab === 'timeline') return 'timeline';
    if (initialQueryTab === 'configuracion') return 'configuracion';
    return 'resumen';
  });
  const [initialTaskId, setInitialTaskId] = useState<number | null>(
    initialQueryTab === 'tareas' || initialQueryTab === 'backlog' || initialQueryTab === 'sprints' || initialQueryTab === 'boards' || initialQueryTab === 'timeline'
      ? normalizedInitialTaskId
      : null,
  );

  const handleScrumPokerTasksUpdated = useCallback(() => {
    refetchAllProjectTasks();
  }, [refetchAllProjectTasks]);

  // Refresh the full task list when entering Scrum Poker so newly created tasks always appear.
  useEffect(() => {
    if (activeTab === 'scrum-poker') refetchAllProjectTasks();
  }, [activeTab, refetchAllProjectTasks]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const taskId = Number(searchParams.get('task'));
    const normalizedTaskId = Number.isNaN(taskId) || taskId <= 0 ? null : taskId;

    if (tab === 'tareas' || tab === 'backlog' || tab === 'sprints' || tab === 'boards') {
      setActiveTab(tab === 'tareas' ? 'backlog' : tab);
      setInitialTaskId(normalizedTaskId);
      return;
    }

    if (tab === 'timeline') {
      setActiveTab('timeline');
      return;
    }

    if (tab === 'configuracion') {
      setActiveTab('configuracion');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!canManageProject && activeTab === 'configuracion') {
      setActiveTab('resumen');
    }
  }, [canManageProject, activeTab]);

  const loading = loadingProject || loadingBoards;

  // ── Error state ───────────────────────────────────────────────────────────
  if (projectError) {
    return (
      <div className="px-4 pt-10 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-[13px] text-destructive">{projectError}</p>
        <button onClick={() => navigate('/projects')} className="mt-3 text-[12px] text-primary hover:underline">
          Volver a Proyectos
        </button>
      </div>
    );
  }

  if (!loadingProject && !loadingMembers && !canAccessProject) {
    return (
      <div className="px-4 pt-10 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-[13px] text-destructive">No tienes acceso a este proyecto.</p>
        <button onClick={() => navigate('/projects')} className="mt-3 text-[12px] text-primary hover:underline">
          Volver a Proyectos
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 pt-3 max-w-[1400px] min-h-full flex flex-col gap-3">
      <section className="rounded-[6px] border border-border bg-card overflow-hidden">
        <CommandBar
          actions={[
            { label: 'Volver', icon: <ArrowLeft className="w-3.5 h-3.5" />, onClick: () => navigate('/projects') },
            { label: 'Actualizar', icon: <RefreshCw className="w-3.5 h-3.5" />, onClick: () => { refetchTasks(); refetchMembers(); refetchBoards(); } },
            ...(canManageProject ? [{ label: 'Asignar responsable', icon: <UserPlus className="w-3.5 h-3.5" />, onClick: () => setShowAssignModal(true) }] : []),
          ]}
          rightSlot={project ? <StatusBadge status={getProjectStatusBadge(project.status)} text={getProjectStatusLabel(project.status)} size="sm" /> : null}
        />

        {loading ? (
          <div className="mx-4 my-3 h-14 animate-pulse bg-surface-secondary/50 rounded-[4px]" />
        ) : project ? (
          <div className="px-4 pb-3 pt-2 border-b border-border">
            <h1 className="text-[16px] font-semibold text-foreground">{project.name}</h1>
            {project.description && (
              <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 mt-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />Inicio: {formatProjectDate(project.created_at)}
              </span>
              {project.end_date && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />Fin: {formatProjectDate(project.end_date)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />{kpis.memberCount} miembros
              </span>
            </div>
          </div>
        ) : null}

        <div className="px-3">
          <ADOTabs
            tabs={[
              { id: 'resumen', label: 'Overview' },
              { id: 'timeline', label: 'Timeline' },
              { id: 'backlog', label: 'Backlog' },
              { id: 'sprints', label: 'Sprints' },
              { id: 'boards', label: 'Boards' },
              { id: 'code-review', label: 'Code Review' },
              { id: 'repositorios', label: 'Repositorios' },
              { id: 'scrum-poker', label: 'Scrum Poker' },
              { id: 'equipo', label: 'Equipo', count: (members ?? []).length },
              ...(canManageProject ? [{ id: 'configuracion', label: 'Configuración', icon: <Settings2 className="w-3.5 h-3.5" /> }] : []),
            ]}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as typeof activeTab)}
          />
        </div>
      </section>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={activeTab === 'backlog' || activeTab === 'sprints' || activeTab === 'boards' || activeTab === 'timeline' ? 'flex-1 min-h-0 flex flex-col' : undefined}
      >
        {/* RESUMEN */}
        {activeTab === 'resumen' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {[
                { title: 'Tareas', value: kpis.total, subtitle: 'en todo el proyecto', icon: <List className="w-4 h-4" />, accentColor: 'info' as const },
                { title: 'Completadas', value: kpis.completed, subtitle: 'finalizadas', icon: <CheckCircle2 className="w-4 h-4" />, accentColor: 'success' as const },
                { title: 'Vencidas', value: kpis.overdue, subtitle: 'requieren atención', icon: <AlertTriangle className="w-4 h-4" />, accentColor: 'destructive' as const },
                {
                  title: 'Tiempo Restante',
                  value: timeRemainingLabel,
                  subtitle: formatProjectDate(project?.end_date),
                  icon: <Clock className="w-4 h-4" />,
                  accentColor: 'warning' as const,
                },
              ].map((card, i) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: i * 0.05, ease: 'easeOut' }}
                >
                  <KPICard title={card.title} value={card.value} subtitle={card.subtitle} icon={card.icon} accentColor={card.accentColor} />
                </motion.div>
              ))}
            </div>

            <div className="grid lg:grid-cols-1 gap-3">
              <div className="space-y-3">
              <div className="bg-card border border-border rounded-[4px] p-4">
                <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em] mb-2.5">
                  Información General
                </h2>
                {project ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                    {[
                      { label: 'Estado', value: getProjectStatusLabel(project.status) },
                      { label: 'Creado', value: formatProjectDate(project.created_at) },
                      { label: 'Fecha inicio', value: project.start_date ? formatProjectDate(project.start_date) : '—' },
                      { label: 'Fecha fin', value: formatProjectDate(project.end_date) },
                      { label: 'Tiempo restante', value: timeRemainingLabel },
                      { label: 'Miembros', value: `${kpis.memberCount} personas` },
                    ].map((item) => (
                      <div key={item.label}>
                        <dt className="text-[10px] text-muted-foreground">{item.label}</dt>
                        <dd className="text-[13px] font-medium text-foreground mt-0.5">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <div className="h-20 animate-pulse bg-secondary rounded" />
                )}
              </div>

              {/* Completion progress bar */}
              {kpis.total > 0 && (
                <div className="bg-card border border-border rounded-[4px] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em]">
                      Avance
                    </h2>
                    <span className="text-[12px] font-semibold text-foreground">
                      {Math.round((kpis.completed / kpis.total) * 100)}%
                    </span>
                  </div>
                  <ProgressBar value={Math.round((kpis.completed / kpis.total) * 100)} height={6} />
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {kpis.completed} de {kpis.total} tareas completadas
                  </p>
                </div>
              )}

              {/* Health / Risk + Burndown */}
              <div className="grid lg:grid-cols-2 gap-3">
                {/* Salud y Riesgo */}
                <div className="bg-card border border-border rounded-[4px] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Gauge className="w-3.5 h-3.5 text-primary" />
                      <h2 className="text-[12px] font-semibold text-foreground">Salud y Riesgo</h2>
                    </div>
                    {(() => {
                      const h = projectAnalytics.health;
                      const cls = h === 'green' ? 'bg-success/15 text-success' : h === 'yellow' ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive';
                      const label = h === 'green' ? 'Saludable' : h === 'yellow' ? 'En riesgo' : 'Crítico';
                      return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
                    })()}
                  </div>

                  {/* Story points */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { label: 'Puntos totales', value: projectAnalytics.totalPoints },
                      { label: 'Completados', value: projectAnalytics.donePoints },
                      { label: 'Restantes', value: Math.max(0, projectAnalytics.totalPoints - projectAnalytics.donePoints) },
                    ].map((s) => (
                      <div key={s.label} className="rounded-[3px] border border-border bg-surface-secondary/30 px-2 py-1.5">
                        <p className="text-[14px] font-bold text-foreground tabular-nums leading-none">{s.value}</p>
                        <p className="text-[9px] text-muted-foreground mt-1">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {projectAnalytics.totalPoints > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground uppercase tracking-[0.06em]">Avance por puntos</span>
                        <span className="font-semibold text-foreground">{projectAnalytics.pointsPct}%</span>
                      </div>
                      <ProgressBar value={projectAnalytics.pointsPct} height={6} />
                    </div>
                  )}

                  {/* Risk assessment vs schedule */}
                  {projectAnalytics.elapsedPct != null ? (
                    <div className="rounded-[3px] border border-border bg-surface-secondary/20 px-2.5 py-2">
                      <div className="flex items-center justify-between text-[10px] mb-1.5">
                        <span className="text-muted-foreground">Tiempo transcurrido</span>
                        <span className="font-medium text-foreground">{projectAnalytics.elapsedPct}%</span>
                      </div>
                      {(() => {
                        const r = projectAnalytics.riskLevel;
                        const cls = r === 'low' ? 'text-success' : r === 'medium' ? 'text-warning' : 'text-destructive';
                        const label = r === 'low' ? 'Bajo riesgo — al ritmo esperado' : r === 'medium' ? 'Riesgo medio — algo por detrás' : 'Alto riesgo — muy por detrás del calendario';
                        return (
                          <p className={`text-[11px] font-medium inline-flex items-center gap-1.5 ${cls}`}>
                            <AlertTriangle className="w-3 h-3" /> {label}
                            {projectAnalytics.shortfall > 0 && <span className="text-muted-foreground font-normal">(−{projectAnalytics.shortfall} pts vs esperado)</span>}
                          </p>
                        );
                      })()}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Define fechas de inicio y fin para evaluar el riesgo de calendario.</p>
                  )}
                </div>

                {/* Burndown */}
                <div className="bg-card border border-border rounded-[4px] p-4 flex flex-col">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <TrendingDown className="w-3.5 h-3.5 text-primary shrink-0" />
                      <h2 className="text-[12px] font-semibold text-foreground">Burndown</h2>
                      {overviewSprint && (
                        <span className="text-[9px] text-muted-foreground">({burndownUsesPoints ? 'puntos' : 'tareas'})</span>
                      )}
                    </div>
                    {burndownSprintOptions.length > 0 && (
                      <select
                        value={effectiveOverviewSprintId ?? ''}
                        onChange={(e) => setOverviewSprintId(e.target.value ? Number(e.target.value) : null)}
                        className="h-7 max-w-[160px] rounded-[3px] border border-border bg-surface-secondary px-2 text-[11px] text-foreground"
                      >
                        {burndownSprintOptions.map((s) => (
                          <option key={s.id_sprint} value={s.id_sprint}>{s.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  {burndownData.length > 0 ? (
                    <div className="flex-1 min-h-[180px]">
                      <ResponsiveContainer width="100%" height={190}>
                        <LineChart data={burndownData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval="preserveStartEnd" minTickGap={16} />
                          <YAxis tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                          <Tooltip
                            cursor={{ stroke: 'var(--border)' }}
                            content={({ active, payload, label }) => {
                              if (!active || !payload || payload.length === 0) return null;
                              const ideal = payload.find((p) => p.dataKey === 'ideal')?.value;
                              const real = payload.find((p) => p.dataKey === 'real')?.value;
                              return (
                                <div className="rounded-[4px] border border-border bg-card px-2.5 py-1.5 shadow-md">
                                  <p className="text-[10px] font-medium text-foreground">Día {label}</p>
                                  {real != null && <p className="text-[10px] text-primary mt-0.5">Restante: {real}</p>}
                                  {ideal != null && <p className="text-[10px] text-muted-foreground">Ideal: {ideal}</p>}
                                </div>
                              );
                            }}
                          />
                          <Line type="monotone" dataKey="ideal" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                          <Line type="monotone" dataKey="real" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center py-6 text-center">
                      <p className="text-[11px] text-muted-foreground">
                        {burndownSprintOptions.length === 0 ? 'No hay sprints con fechas para graficar.' : 'Este sprint no tiene tareas o fechas válidas.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Milestones Roadmap */}
              <div className="bg-card border border-border rounded-[4px] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Flag className="w-3.5 h-3.5 text-primary" />
                    <h2 className="text-[12px] font-semibold text-foreground">Roadmap de Milestones</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {sortedMilestones.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {sortedMilestones.filter((m) => m.is_completed).length}/{sortedMilestones.length} completados
                      </span>
                    )}
                    {canEditMilestones && (
                      <>
                        {sortedMilestones.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setMilestonesEditing((v) => !v);
                              setEditingMilestoneId(null);
                              setEditMilestoneDraft(null);
                              setShowAddMilestoneForm(false);
                            }}
                            className={`h-6 px-2.5 rounded-[3px] border text-[10px] font-medium inline-flex items-center gap-1 transition-colors ${milestonesEditing ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'}`}
                          >
                            {milestonesEditing ? <><XIcon className="w-3 h-3" /> Cancelar</> : <><Pencil className="w-3 h-3" /> Editar</>}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setShowAddMilestoneForm((v) => !v); setNewMilestoneDraft({ name: '', description: '', due_date: '' }); }}
                          className="h-6 w-6 rounded-[3px] border border-border text-muted-foreground hover:text-primary hover:border-primary/50 inline-flex items-center justify-center transition-colors"
                          title="Agregar milestone"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Add milestone form */}
                {canEditMilestones && showAddMilestoneForm && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-5 rounded-[4px] border border-border bg-secondary/20 overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-border bg-secondary/30">
                      <p className="text-[12px] font-semibold text-foreground">Nuevo Milestone</p>
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">Nombre <span className="text-destructive">*</span></label>
                        <input
                          type="text"
                          placeholder="Ej. MVP listo, Entrega final..."
                          value={newMilestoneDraft.name}
                          onChange={(e) => setNewMilestoneDraft((d) => ({ ...d, name: e.target.value }))}
                          className="w-full bg-input-background border border-input rounded-[3px] px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">Descripción</label>
                        <input
                          type="text"
                          placeholder="Descripción breve (opcional)"
                          value={newMilestoneDraft.description}
                          onChange={(e) => setNewMilestoneDraft((d) => ({ ...d, description: e.target.value }))}
                          className="w-full bg-input-background border border-input rounded-[3px] px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-muted-foreground">Fecha límite</label>
                        <DatePickerField
                          value={newMilestoneDraft.due_date}
                          onChange={(v) => setNewMilestoneDraft((d) => ({ ...d, due_date: v }))}
                          placeholder="Sin fecha límite"
                          minDate={project?.start_date?.slice(0, 10) ?? project?.created_at?.slice(0, 10)}
                          maxDate={project?.end_date ?? undefined}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-border bg-secondary/10">
                      <button
                        type="button"
                        onClick={() => { setShowAddMilestoneForm(false); setNewMilestoneDraft({ name: '', description: '', due_date: '' }); }}
                        className="h-7 px-3 rounded-[3px] border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={addingMilestone || !newMilestoneDraft.name.trim()}
                        onClick={async () => {
                          if (!newMilestoneDraft.name.trim() || !projectId) return;
                          setAddingMilestone(true);
                          try {
                            await tasksService.createMilestone({
                              project: Number(projectId),
                              name: newMilestoneDraft.name.trim(),
                              ...(newMilestoneDraft.description ? { description: newMilestoneDraft.description } : {}),
                              ...(newMilestoneDraft.due_date ? { due_date: newMilestoneDraft.due_date } : {}),
                            });
                            refetchMilestones();
                            setShowAddMilestoneForm(false);
                            setNewMilestoneDraft({ name: '', description: '', due_date: '' });
                            toast.success('Milestone agregado');
                          } catch {
                            toast.error('No se pudo agregar el milestone.');
                          } finally {
                            setAddingMilestone(false);
                          }
                        }}
                        className="h-7 px-3 rounded-[3px] bg-primary hover:bg-primary-hover text-primary-foreground text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {addingMilestone && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        Agregar
                      </button>
                    </div>
                  </motion.div>
                )}

                {sortedMilestones.length === 0 ? (
                  <div className="py-6 text-center">
                    <Flag className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[11px] text-muted-foreground italic">No hay milestones definidos para este proyecto.</p>
                  </div>
                ) : (
                  <>
                    {/* Progress bar */}
                    {(() => {
                      const total = sortedMilestones.length;
                      const done = sortedMilestones.filter((m) => m.is_completed).length;
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                      return (
                        <div className="mb-5">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">{pct}% completado</p>
                        </div>
                      );
                    })()}

                    {/* Timeline — flex-based, no absolute positioning needed */}
                    {(() => {
                      const firstUnfinishedIdx = sortedMilestones.findIndex((m) => !m.is_completed);
                      const lastCompletedIdx = firstUnfinishedIdx === -1
                        ? sortedMilestones.length - 1
                        : firstUnfinishedIdx - 1;
                      // Reordering is disabled entirely once any milestone is completed.
                      const anyCompleted = sortedMilestones.some((m) => m.is_completed);
                      const canReorder = milestonesEditing && !anyCompleted;

                      return (
                        <>
                        {milestonesEditing && anyCompleted && (
                          <p className="text-[10px] text-muted-foreground mb-2">El reordenamiento se bloquea cuando hay milestones completados.</p>
                        )}
                        <DndContext collisionDetection={closestCenter} onDragEnd={handleMilestoneDragEnd}>
                          <SortableContext items={sortedMilestones.map((m) => m.id_milestone)} strategy={verticalListSortingStrategy}>
                          <div className="flex flex-col">
                          {sortedMilestones.map((ms, idx) => {
                            const isInlineEditing = milestonesEditing && editingMilestoneId === ms.id_milestone;
                            const isLast = idx === sortedMilestones.length - 1;
                            const canComplete = !ms.is_completed && idx === firstUnfinishedIdx;
                            const canUncomplete = ms.is_completed && idx === lastCompletedIdx;
                            const showToggle = milestonesEditing && (canComplete || canUncomplete);

                            return (
                              <SortableMilestone key={ms.id_milestone} id={ms.id_milestone} disabled={!canReorder || isInlineEditing}>
                                {({ attributes, listeners }) => (
                              <div className="flex gap-3">
                                {canReorder && !isInlineEditing && (
                                  <button
                                    type="button"
                                    {...attributes}
                                    {...listeners}
                                    className="cursor-grab touch-none text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
                                    title="Arrastrar para reordenar"
                                  >
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {/* Node column: circle + connector line */}
                                <div className="flex flex-col items-center w-4 shrink-0">
                                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all duration-300 ${
                                    ms.is_completed
                                      ? 'bg-green-500 border-green-500'
                                      : idx === firstUnfinishedIdx
                                        ? 'bg-card border-primary ring-2 ring-primary/20'
                                        : 'bg-card border-border'
                                  }`}>
                                    {ms.is_completed && <Check className="w-2.5 h-2.5 text-white" />}
                                  </div>
                                  {!isLast && (
                                    <div className={`w-0.5 flex-1 min-h-[24px] mt-1 transition-colors duration-300 ${ms.is_completed ? 'bg-green-500' : 'bg-border'}`} />
                                  )}
                                </div>

                                {/* Content column */}
                                <div className="flex-1 min-w-0 pb-5">
                                  {isInlineEditing && editMilestoneDraft ? (
                                    /* Inline edit form */
                                    <motion.div
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      className="rounded-[4px] border border-border bg-secondary/20 overflow-hidden -mt-0.5"
                                    >
                                      <div className="px-3 py-2 border-b border-border bg-secondary/30">
                                        <p className="text-[11px] font-semibold text-foreground">Editar milestone</p>
                                      </div>
                                      <div className="px-3 py-2.5 space-y-2.5">
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-medium text-muted-foreground">Nombre</label>
                                          <input
                                            type="text"
                                            value={editMilestoneDraft.name}
                                            onChange={(e) => setEditMilestoneDraft((d) => d ? { ...d, name: e.target.value } : d)}
                                            className="w-full bg-input-background border border-input rounded-[3px] px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-medium text-muted-foreground">Descripción</label>
                                          <input
                                            type="text"
                                            value={editMilestoneDraft.description}
                                            onChange={(e) => setEditMilestoneDraft((d) => d ? { ...d, description: e.target.value } : d)}
                                            placeholder="Descripción breve (opcional)"
                                            className="w-full bg-input-background border border-input rounded-[3px] px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-medium text-muted-foreground">Fecha límite</label>
                                          <DatePickerField
                                            value={editMilestoneDraft.due_date}
                                            onChange={(v) => setEditMilestoneDraft((d) => d ? { ...d, due_date: v } : d)}
                                            placeholder="Sin fecha límite"
                                            minDate={project?.start_date?.slice(0, 10) ?? project?.created_at?.slice(0, 10)}
                                            maxDate={project?.end_date ?? undefined}
                                          />
                                        </div>
                                      </div>
                                      <div className="flex justify-end gap-2 px-3 py-2 border-t border-border bg-secondary/10">
                                        <button
                                          type="button"
                                          onClick={() => { setEditingMilestoneId(null); setEditMilestoneDraft(null); }}
                                          className="h-6 px-2.5 rounded-[3px] border border-border text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                                        >
                                          Cancelar
                                        </button>
                                        <button
                                          type="button"
                                          disabled={milestoneSaving === ms.id_milestone}
                                          onClick={async () => {
                                            if (!editMilestoneDraft) return;
                                            setMilestoneSaving(ms.id_milestone);
                                            try {
                                              await tasksService.updateMilestone(ms.id_milestone, {
                                                name: editMilestoneDraft.name.trim() || undefined,
                                                description: editMilestoneDraft.description || null,
                                                due_date: editMilestoneDraft.due_date || null,
                                              });
                                              refetchMilestones();
                                              setEditingMilestoneId(null);
                                              setEditMilestoneDraft(null);
                                            } catch {
                                              toast.error('No se pudo guardar el milestone.');
                                            } finally {
                                              setMilestoneSaving(null);
                                            }
                                          }}
                                          className="h-6 px-2.5 rounded-[3px] bg-primary hover:bg-primary-hover text-primary-foreground text-[10px] font-medium inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                                        >
                                          {milestoneSaving === ms.id_milestone && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                          Guardar
                                        </button>
                                      </div>
                                    </motion.div>
                                  ) : (
                                    /* Read / edit-actions view */
                                    <div className={`${ms.is_completed && !milestonesEditing ? 'opacity-60' : ''}`}>
                                      <div className="flex items-start justify-between gap-2 flex-wrap">
                                        <div className="min-w-0">
                                          <p className={`text-[12px] font-medium leading-tight ${ms.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                            {ms.name}
                                          </p>
                                          {ms.description && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{ms.description}</p>
                                          )}
                                          {ms.due_date && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                              <Calendar className="w-2.5 h-2.5" />{ms.due_date.slice(0, 10)}
                                            </p>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          {milestonesEditing ? (
                                            <>
                                              {showToggle && (
                                                <button
                                                  type="button"
                                                  disabled={milestoneSaving === ms.id_milestone}
                                                  onClick={async () => {
                                                    setMilestoneSaving(ms.id_milestone);
                                                    try {
                                                      await tasksService.updateMilestone(ms.id_milestone, { is_completed: !ms.is_completed });
                                                      refetchMilestones();
                                                    } catch {
                                                      toast.error('No se pudo actualizar el milestone.');
                                                    } finally {
                                                      setMilestoneSaving(null);
                                                    }
                                                  }}
                                                  className={`h-6 px-2 rounded-[3px] border text-[10px] font-medium inline-flex items-center gap-1 transition-colors disabled:opacity-50 ${
                                                    ms.is_completed
                                                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                                                      : 'border-green-500/40 bg-green-500/10 text-green-600 hover:bg-green-500/20'
                                                  }`}
                                                >
                                                  {milestoneSaving === ms.id_milestone ? (
                                                    <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                                  ) : ms.is_completed ? (
                                                    'Desmarcar'
                                                  ) : (
                                                    <><Check className="w-3 h-3" /> Completar</>
                                                  )}
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditingMilestoneId(ms.id_milestone);
                                                  setEditMilestoneDraft({
                                                    name: ms.name,
                                                    description: ms.description ?? '',
                                                    due_date: ms.due_date ? ms.due_date.slice(0, 10) : '',
                                                  });
                                                }}
                                                className="h-6 w-6 rounded-[3px] border border-border text-muted-foreground hover:text-primary hover:border-primary/40 inline-flex items-center justify-center transition-colors"
                                                title="Editar detalles"
                                              >
                                                <Pencil className="w-3 h-3" />
                                              </button>
                                              <button
                                                type="button"
                                                disabled={deletingMilestone === ms.id_milestone}
                                                onClick={async () => {
                                                  if (!confirm(`¿Eliminar el milestone "${ms.name}"?`)) return;
                                                  setDeletingMilestone(ms.id_milestone);
                                                  try {
                                                    await tasksService.deleteMilestone(ms.id_milestone);
                                                    refetchMilestones();
                                                    toast.success('Milestone eliminado');
                                                  } catch {
                                                    toast.error('No se pudo eliminar el milestone.');
                                                  } finally {
                                                    setDeletingMilestone(null);
                                                  }
                                                }}
                                                className="h-6 w-6 rounded-[3px] border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 inline-flex items-center justify-center transition-colors disabled:opacity-50"
                                                title="Eliminar milestone"
                                              >
                                                {deletingMilestone === ms.id_milestone
                                                  ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                                  : <Trash2 className="w-3 h-3" />}
                                              </button>
                                            </>
                                          ) : (
                                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${ms.is_completed ? 'bg-green-500/10 text-green-600' : 'bg-muted/60 text-muted-foreground'}`}>
                                              {ms.is_completed ? 'Completado' : 'Pendiente'}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                                )}
                              </SortableMilestone>
                            );
                          })}
                          </div>
                          </SortableContext>
                        </DndContext>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
              </div>
            </div>
          </div>
        )}

        {/* WORKSPACE TABS */}
        {(activeTab === 'backlog' || activeTab === 'sprints' || activeTab === 'boards') && (
          <div className="flex-1 min-h-0 flex flex-col">
            <ProjectTasksWorkspace
              projectId={projectId}
              userMap={userMap}
              assignableUsers={assignableUsers}
              canCreateTasks={canManageTasks}
              canCreateBoards={canManageTasks}
              canEditTasks={canManageTasks}
              canDeleteTasks={canManageTasks}
              canMoveTasks={capabilities.canMoveTasks}
              projectEndDate={project?.end_date ?? null}
              projectStartDate={project?.start_date ?? null}
              forcedTab={activeTab}
              initialTaskId={initialTaskId}
              onInitialTaskHandled={(taskId: number) => {
                setInitialTaskId((current) => (current === taskId ? null : current));
                const nextParams = new URLSearchParams(searchParams);
                nextParams.delete('task');
                setSearchParams(nextParams, { replace: true });
              }}
            />
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <Timeline projectId={projectId} projectStartDate={project?.start_date} projectEndDate={project?.end_date} />
          </div>
        )}

        {/* CODE REVIEW */}
        {activeTab === 'code-review' && (
          <CodeReviewPanel
            projectId={projectId}
            repoFullName={project?.github_repo_full_name ?? null}
          />
        )}

        {/* REPOSITORIOS */}
        {activeTab === 'repositorios' && (
          <GitHubReposView projectId={projectId} canCreateRepos={canCreateRepos} />
        )}

        {/* SCRUM POKER */}
        {activeTab === 'scrum-poker' && (
          <div className="rounded-[6px] border border-border bg-card p-4 space-y-3">
            <div>
              <h2 className="text-[13px] font-semibold text-foreground">Scrum Poker</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Asigna story points (escala Fibonacci) a cada tarea del proyecto.
              </p>
            </div>
            <ScrumPokerPanel
              tasks={allProjectTasks}
              sprints={sprints ?? []}
              userMap={userMap}
              canEdit={canManageTasks}
              tags={projectTags ?? []}
              onTasksUpdated={handleScrumPokerTasksUpdated}
            />
          </div>
        )}

        {/* EQUIPO */}
        {activeTab === 'equipo' && (
          <div className="space-y-3">
          <div className="bg-card border border-border rounded-[4px] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em]">
                  Miembros del Proyecto
                </h2>
                {members && members.length > 0 && (
                  <AvatarGroup
                    users={(members ?? []).map((m) => ({
                      name: userMap.get(m.user) ?? `Usuario #${m.user}`,
                    }))}
                    max={5}
                    size={24}
                  />
                )}
              </div>
              {canManageMembers && (
                <button
                  onClick={() => setShowAddMemberModal(true)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-[3px] transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Agregar Miembro
                </button>
              )}
            </div>

            {(loadingMembers || loadingUsers) ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse bg-secondary rounded" />)}
              </div>
            ) : !members || members.length === 0 ? (
              <p className="text-[12px] text-muted-foreground py-6 text-center">Sin miembros registrados.</p>
            ) : (
              <div className="space-y-0.5">
                {members.map((member) => {
                  const name = userMap.get(member.user) ?? `Usuario #${member.user}`;
                  const roleName = roleMap.get(member.role ?? 0) ?? `Rol #${member.role ?? '—'}`;
                  const memberUser = memberUserMap.get(member.user) ?? null;
                  const canChangeRole = canEditMemberRoles && canEditMemberProjectRole(memberUser, member, projectRoleIds);
                  const roleIsLocked = isStakeholderSystemUser(memberUser);
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between py-2.5 px-3 rounded-[6px] border border-border/60 bg-surface-secondary/20 hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-medium">
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-foreground">{name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[11px] font-medium text-foreground">{member.role ? roleName : 'Sin rol'}</p>
                            {canChangeRole && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMemberId(member.id);
                                  setEditingRoleId(member.role ?? null);
                                }}
                                className="h-6 px-2.5 text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-[3px] transition-colors"
                              >
                                Editar
                              </button>
                            )}
                            {member.role === projectRoleIds.projectManagerId && (
                              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                PM
                              </span>
                            )}
                            {roleIsLocked && (
                              <span className="inline-flex items-center rounded-full border border-border bg-surface-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                Fijo por sistema
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          desde {member.joined_at.slice(0, 10)}
                        </span>
                        {canManageMembers && member.role !== projectRoleIds.projectManagerId && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id)}
                            disabled={removingMemberId === member.id}
                            className="h-7 px-2 text-[10px] font-medium text-destructive border border-destructive/30 rounded-[3px] hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          >
                            {removingMemberId === member.id ? 'Eliminando…' : 'Eliminar'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Project leaderboard */}
          <div className="bg-card border border-border rounded-[4px] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Trophy className="w-3.5 h-3.5 text-primary" />
              <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em]">Ranking del proyecto</h2>
            </div>
            {loadingLeaderboard ? (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-4 py-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando ranking…
              </div>
            ) : (
              <Leaderboard entries={leaderboard ?? []} currentUserId={currentUserNumericId} />
            )}
          </div>
          </div>
        )}

        {activeTab === 'configuracion' && (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-3">
            <div className="bg-card border border-border rounded-[4px] p-4">
              <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em] mb-3">
                Configuración del Proyecto
              </h2>

              <div className="space-y-3 max-w-md">
                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">Etapa del proyecto</label>
                  <select
                    value={projectStatus}
                    onChange={(e) => setProjectStatus(e.target.value)}
                    disabled={!canManageProject || savingProjectConfig}
                    className="w-full h-8 bg-surface-secondary border border-border rounded-[3px] px-2.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 disabled:opacity-60"
                  >
                    {PROJECT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">Fecha de inicio</label>
                  <DatePickerField
                    value={projectStartDate}
                    onChange={(v) => {
                      setProjectStartDate(v);
                      if (projectEndDate && v && projectEndDate < v) setProjectEndDate('');
                    }}
                    disabled={!canManageProject || savingProjectConfig}
                    minDate={tomorrowDate}
                    maxDate={projectEndDate || undefined}
                    placeholder="Selecciona una fecha de inicio"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-foreground mb-1">Fecha de entrega</label>
                  <DatePickerField
                    value={projectEndDate}
                    onChange={setProjectEndDate}
                    disabled={!canManageProject || savingProjectConfig}
                    minDate={endDateMinDate}
                    placeholder="Selecciona una fecha de entrega"
                  />
                  {latestSprintEndDate && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      No puede ser antes del último sprint: <span className="font-medium">{latestSprintEndDate}</span>
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleProjectStatusSave}
                  disabled={!canManageProject || savingProjectConfig || !hasProjectConfigChanges}
                  className="h-8 px-3 bg-primary hover:bg-primary-hover text-primary-foreground rounded-[3px] text-[11px] font-medium transition-colors disabled:opacity-50"
                >
                  {savingProjectConfig ? 'Guardando…' : 'Guardar cambios'}
                </button>

                {!canManageProject && (
                  <p className="text-[11px] text-muted-foreground">Solo el Project Manager del proyecto puede modificar la configuración.</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-card border border-border rounded-[4px] p-4">
                <h2 className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.06em] mb-1">Restricciones de equipo</h2>
                <p className="text-[11px] text-muted-foreground mb-3">Por defecto solo se pueden agregar miembros con cuenta de GitHub conectada. Puedes desactivar esto temporalmente.</p>
                <button
                  type="button"
                  disabled={!canManageProject}
                  onClick={() => setBypassGithubCheck((prev) => !prev)}
                  className={`inline-flex items-center gap-2 h-8 px-3 rounded-[3px] text-[11px] font-medium border transition-colors disabled:opacity-50 ${
                    bypassGithubCheck
                      ? 'bg-warning/10 border-warning/40 text-warning hover:bg-warning/20'
                      : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${bypassGithubCheck ? 'bg-warning' : 'bg-muted-foreground/50'}`} />
                  {bypassGithubCheck ? 'Verificación de GitHub desactivada' : 'Requerir GitHub al agregar miembros'}
                </button>
              </div>

              <div className="bg-card border border-destructive/20 rounded-[4px] p-4 h-fit">
              <h2 className="text-[10px] font-medium text-destructive uppercase tracking-[0.06em] mb-2">
                Zona Peligrosa
              </h2>
              <p className="text-[11px] text-muted-foreground mb-3">
                Eliminar este proyecto también removerá su acceso desde la vista principal.
              </p>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={!canManageProject || deletingProject}
                className="h-8 px-3 bg-destructive hover:bg-destructive/90 text-white rounded-[3px] text-[11px] font-medium transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingProject ? 'Eliminando…' : 'Eliminar proyecto'}
              </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <AddMemberModal
        open={showAddMemberModal}
        onOpenChange={setShowAddMemberModal}
        candidates={candidatesToAdd}
        roles={projectRoleOptions}
        roleIds={projectRoleIds}
        bypassGithubCheck={bypassGithubCheck}
        onSubmit={handleAddMember}
      />

      <AssignResponsibleModal
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        candidates={assignCandidates}
        currentResponsibleId={currentProjectManagerMember?.user}
        onAssign={handleAssign}
        loading={assigningResponsible}
        title="Asignar responsable"
      />

      {editingMemberId != null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border rounded-[6px] p-5 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[13px] font-semibold text-foreground mb-4">Cambiar rol del miembro</h2>
            {(() => {
              const member = (members ?? []).find((m) => m.id === editingMemberId);
              if (!member) return null;
              const memberUser = memberUserMap.get(member.user);
              const allowedRoleIds = getAllowedProjectRoleIdsForUser(memberUser, projectRoleIds);
              return (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-foreground mb-2">Nuevo rol</label>
                    <select
                      value={editingRoleId ?? ''}
                      onChange={(e) => setEditingRoleId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full h-9 bg-surface-secondary border border-border rounded-[4px] px-3 text-[12px] text-foreground"
                    >
                      {allowedRoleIds.map((roleId) => (
                        <option key={roleId} value={roleId}>{roleMap.get(roleId) ?? `Rol #${roleId}`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingMemberId(null)}
                      className="flex-1 h-8 border border-border rounded-[3px] text-[11px] font-medium text-foreground hover:bg-accent/30 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (editingRoleId != null) {
                          await handleMemberRoleChange(editingMemberId, editingRoleId);
                          setEditingMemberId(null);
                        }
                      }}
                      disabled={updatingMemberRoleId === editingMemberId}
                      className="flex-1 h-8 bg-primary text-primary-foreground rounded-[3px] text-[11px] font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                    >
                      {updatingMemberRoleId === editingMemberId ? 'Actualizando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
