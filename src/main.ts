import './style.css';
import type { Member, Task, TaskCategory, TaskStatus } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

type TaskAction = 'start' | 'complete' | 'delete';

const categoryLabel: Record<TaskCategory, string> = {
  ux: 'UX',
  'dev frontend': 'Dev Frontend',
  'dev backend': 'Dev Backend',
};

const boardRoot = document.querySelector<HTMLElement>('.board');
let allMembers: Member[] = [];
let membersById = new Map<string, Member>();
let tasksById = new Map<string, Task>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setGlobalMessage(message: string): void {
  let messageElement = document.getElementById('global-message');

  if (!messageElement) {
    messageElement = document.createElement('p');
    messageElement.id = 'global-message';
    messageElement.className = 'global-message';

    const formsContainer = document.querySelector('.forms-container');
    if (formsContainer?.parentElement) {
      formsContainer.parentElement.insertBefore(messageElement, formsContainer.nextSibling);
    }
  }

  if (messageElement) {
    messageElement.textContent = message;
    messageElement.hidden = message.length === 0;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${path}`);
  }

  return (await response.json()) as T;
}

async function sendJson(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${path}`);
  }
}

async function loadBoard(): Promise<void> {
  try {
    setGlobalMessage('');
    const [tasks, members] = await Promise.all([
      fetchJson<Task[]>('/tasks'),
      fetchJson<Member[]>('/members'),
    ]);

    allMembers = members;
    membersById = new Map(members.map((member) => [member.id, member]));
    renderTasks(tasks);
  } catch (error) {
    console.error(error);
    setGlobalMessage('Kunde inte ladda tavlan. Kontrollera att API-servern ar igang.');
  }
}

function updateCounters(counts: Record<TaskStatus, number>): void {
  const cNew = document.getElementById('count-new');
  const cDoing = document.getElementById('count-doing');
  const cDone = document.getElementById('count-done');

  if (cNew) cNew.textContent = counts.new.toString();
  if (cDoing) cDoing.textContent = counts.doing.toString();
  if (cDone) cDone.textContent = counts.done.toString();
}

function renderTasks(tasks: Task[]): void {
  const columns: Record<TaskStatus, HTMLElement | null> = {
    new: document.getElementById('status-new'),
    doing: document.getElementById('status-doing'),
    done: document.getElementById('status-done'),
  };

  tasksById = new Map(tasks.map((task) => [task.id, task]));

  (Object.values(columns) as Array<HTMLElement | null>).forEach((column) => {
    if (column) column.innerHTML = '';
  });

  const counts: Record<TaskStatus, number> = { new: 0, doing: 0, done: 0 };

  tasks.forEach((task) => {
    const targetColumn = columns[task.status];
    if (!targetColumn) return;

    counts[task.status] += 1;

    const card = document.createElement('div');
    card.className = 'task-card';
    card.dataset.taskId = task.id;

    const matchingMembers = allMembers.filter((member) => member.category === task.category);
    const memberOptions = matchingMembers
      .map((member) => {
        const selected = task.assignedTo === member.id ? 'selected' : '';
        return `<option value="${escapeHtml(member.id)}" ${selected}>${escapeHtml(member.name)}</option>`;
      })
      .join('');

    const isLocked = task.status !== 'new';
    const hasAssignee = Boolean(task.assignedTo && task.assignedTo.trim().length > 0);

    const assignedLabel = task.assignedTo
      ? membersById.get(task.assignedTo)?.name ?? task.assignedTo
      : 'Ej tilldelad';

    const assignHtml = isLocked
      ? `<p><strong>Ansvarig:</strong> ${escapeHtml(assignedLabel)}</p>`
      : `<div class="assign-section">
          <label for="assignee-${task.id}">Tilldela ${categoryLabel[task.category]}:</label>
          <select id="assignee-${task.id}" data-action="assign" data-task-id="${task.id}">
            <option value="">-- Valj person --</option>
            ${memberOptions}
          </select>
        </div>`;

    const startButton =
      task.status === 'new'
        ? `<button data-action="start" data-task-id="${task.id}" ${
            hasAssignee ? '' : 'disabled aria-disabled="true"'
          }>Starta</button>`
        : '';

    const completeButton =
      task.status === 'doing'
        ? `<button data-action="complete" data-task-id="${task.id}">Fardigstall</button>`
        : '';

    const deleteButton =
      task.status === 'done'
        ? `<button data-action="delete" data-task-id="${task.id}" class="delete-btn">Radera</button>`
        : `<span class="lock-text">Last</span>`;

    const startValidationMessage =
      task.status === 'new' && !hasAssignee
        ? '<p class="task-warning">Tilldela en ansvarig innan projektet kan startas.</p>'
        : '';

    card.innerHTML = `
      <h4>${escapeHtml(task.title)}</h4>
      <p>${escapeHtml(task.description)}</p>
      ${assignHtml}
      ${startValidationMessage}
      <div class="actions">
        ${startButton}
        ${completeButton}
        ${deleteButton}
      </div>
      <div class="task-footer">
        <small class="timestamp">Skapad: ${escapeHtml(task.timestamp)}</small>
      </div>
    `;

    targetColumn.appendChild(card);
  });

  updateCounters(counts);
}

async function updateTaskStatus(id: string, newStatus: Extract<TaskStatus, 'doing' | 'done'>): Promise<void> {
  await sendJson(`/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  });
}

async function assignMember(id: string, memberId: string | null): Promise<void> {
  await sendJson(`/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignedTo: memberId }),
  });
}

async function deleteTask(id: string): Promise<void> {
  await sendJson(`/tasks/${id}`, { method: 'DELETE' });
}

async function handleTaskAction(action: TaskAction, taskId: string): Promise<void> {
  const task = tasksById.get(taskId);
  if (!task) return;

  if (action === 'start') {
    if (!task.assignedTo || task.assignedTo.trim().length === 0) {
      setGlobalMessage('Projektet kan inte startas utan tilldelad ansvarig.');
      return;
    }

    await updateTaskStatus(taskId, 'doing');
    return;
  }

  if (action === 'complete') {
    await updateTaskStatus(taskId, 'done');
    return;
  }

  await deleteTask(taskId);
}

boardRoot?.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('button[data-action][data-task-id]');
  if (!button) return;

  const action = button.dataset.action as TaskAction | undefined;
  const taskId = button.dataset.taskId;
  if (!action || !taskId) return;

  try {
    setGlobalMessage('');
    await handleTaskAction(action, taskId);
    await loadBoard();
  } catch (error) {
    console.error(error);
    setGlobalMessage('Nagot gick fel. Forsok igen.');
  }
});

boardRoot?.addEventListener('change', async (event) => {
  const target = event.target as HTMLElement;
  const select = target.closest<HTMLSelectElement>('select[data-action="assign"][data-task-id]');
  if (!select) return;

  const taskId = select.dataset.taskId;
  if (!taskId) return;

  const memberId = select.value.trim();

  try {
    setGlobalMessage('');
    await assignMember(taskId, memberId.length > 0 ? memberId : null);
    await loadBoard();
  } catch (error) {
    console.error(error);
    setGlobalMessage('Kunde inte uppdatera ansvarig.');
  }
});

const taskForm = document.getElementById('task-form') as HTMLFormElement | null;
taskForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const titleInput = document.getElementById('task-title') as HTMLInputElement | null;
  const descriptionInput = document.getElementById('task-desc') as HTMLInputElement | null;
  const categoryInput = document.getElementById('task-category') as HTMLSelectElement | null;
  if (!titleInput || !descriptionInput || !categoryInput) return;

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const category = categoryInput.value as TaskCategory;

  if (!title || !description) {
    setGlobalMessage('Titel och beskrivning maste fyllas i.');
    return;
  }

  try {
    setGlobalMessage('');
    await sendJson('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, category }),
    });

    taskForm.reset();
    await loadBoard();
  } catch (error) {
    console.error(error);
    setGlobalMessage('Kunde inte skapa uppgift.');
  }
});

const memberForm = document.getElementById('member-form') as HTMLFormElement | null;
memberForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const nameInput = document.getElementById('member-name') as HTMLInputElement | null;
  const categoryInput = document.getElementById('member-category') as HTMLSelectElement | null;
  if (!nameInput || !categoryInput) return;

  const name = nameInput.value.trim();
  const category = categoryInput.value as TaskCategory;

  if (!name) {
    setGlobalMessage('Medlemsnamn maste fyllas i.');
    return;
  }

  try {
    setGlobalMessage('');
    await sendJson('/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category }),
    });

    memberForm.reset();
    await loadBoard();
  } catch (error) {
    console.error(error);
    setGlobalMessage('Kunde inte skapa medlem.');
  }
});

void loadBoard();
