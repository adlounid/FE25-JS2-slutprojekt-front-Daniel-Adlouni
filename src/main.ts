import type { Member, Task, TaskCategory, TaskStatus } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

type TaskAction = 'start' | 'complete' | 'delete';

const board = document.getElementById('board');
const globalMessageNode = document.getElementById('global-message');

const statusContainers: Record<TaskStatus, HTMLElement | null> = {
  new: document.getElementById('status-new'),
  doing: document.getElementById('status-doing'),
  done: document.getElementById('status-done'),
};

const countNodes: Record<TaskStatus, HTMLElement | null> = {
  new: document.getElementById('count-new'),
  doing: document.getElementById('count-doing'),
  done: document.getElementById('count-done'),
};

let members: Member[] = [];
let memberById = new Map<string, Member>();
let taskById = new Map<string, Task>();

// Visar ett globalt meddelande i UI
const showMessage = (message: string): void => {
  if (globalMessageNode) globalMessageNode.textContent = message;
};

// Tömmer meddelanderaden
const clearMessage = (): void => showMessage('');

// Escapar text så att den kan skrivas säkert i HTML
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Gör ett API-anrop som förväntas returnera JSON
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) throw new Error(`API ${response.status} on ${path}`);
  return (await response.json()) as T;
}

// Gör ett API-anrop där vi bara behöver veta att det lyckades
async function requestNoBody(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) throw new Error(`API ${response.status} on ${path}`);
}

// Filtrerar fram medlemmar som matchar en viss kategori
const membersForCategory = (category: TaskCategory): Member[] =>
  members.filter((member) => member.category === category);

// Hämtar visningsnamn för ansvarig, eller fallback om ingen finns
const assigneeLabel = (task: Task): string =>
  task.assignedTo ? memberById.get(task.assignedTo)?.name ?? task.assignedTo : 'Ej tilldelad';

// Räknar antal uppgifter per status och uppdaterar räknarna i UI
function renderCounters(): void {
  const counts: Record<TaskStatus, number> = { new: 0, doing: 0, done: 0 };
  taskById.forEach((task) => {
    counts[task.status] += 1;
  });
  (Object.keys(countNodes) as TaskStatus[]).forEach((status) => {
    const node = countNodes[status];
    if (node) node.textContent = String(counts[status]);
  });
}

// Bygger ett kort för en uppgift med rätt knappar och tilldelningsfält
function buildTaskCard(task: Task): HTMLDivElement {
  const card = document.createElement('div');
  card.dataset.taskId = task.id;

  const hasAssignee = Boolean(task.assignedTo && task.assignedTo.trim().length > 0);
  const options = membersForCategory(task.category)
    .map((member) => {
      const selected = task.assignedTo === member.id ? 'selected' : '';
      return `<option value="${escapeHtml(member.id)}" ${selected}>${escapeHtml(member.name)}</option>`;
    })
    .join('');

  const assigneeBlock =
    task.status === 'new'
      ? `
        <label for="assignee-${task.id}">Ansvarig:</label>
        <select id="assignee-${task.id}" data-action="assign" data-task-id="${task.id}">
          <option value="">-- Välj person --</option>
          ${options}
        </select>
      `
      : `<p><strong>Ansvarig:</strong> ${escapeHtml(assigneeLabel(task))}</p>`;

  const actionButton =
    task.status === 'new'
      ? `<button data-action="start" data-task-id="${task.id}" ${hasAssignee ? '' : 'disabled'}>Starta</button>`
      : task.status === 'doing'
        ? `<button data-action="complete" data-task-id="${task.id}">Färdigställ</button>`
        : `<button data-action="delete" data-task-id="${task.id}">Radera</button>`;

  const warning =
    task.status === 'new' && !hasAssignee
      ? '<p data-warning="start">Kan inte starta innan ansvarig är vald.</p>'
      : '';

  card.innerHTML = `
    <h3>${escapeHtml(task.title)}</h3>
    <p>${escapeHtml(task.description)}</p>
    <p><strong>Kategori:</strong> ${escapeHtml(task.category)}</p>
    ${assigneeBlock}
    ${warning}
    <p><strong>Skapad:</strong> ${escapeHtml(task.timestamp)}</p>
    ${actionButton}
    <hr />
  `;

  return card;
}

// Renderar om hela tavlan utifrån aktuellt status 
function renderBoard(): void {
  const columns = Object.values(statusContainers);
  if (columns.some((column) => !column)) return;

  columns.forEach((column) => {
    column!.innerHTML = '';
  });

  taskById.forEach((task) => {
    const container = statusContainers[task.status];
    if (!container) return;
    container.appendChild(buildTaskCard(task));
  });

  renderCounters();
}

// Laddar tasks och members från API och synkar sedan UI
async function loadBoard(): Promise<void> {
  try {
    clearMessage();
    const [tasks, loadedMembers] = await Promise.all([
      request<Task[]>('/tasks'),
      request<Member[]>('/members'),
    ]);
    members = loadedMembers;
    memberById = new Map(loadedMembers.map((member) => [member.id, member]));
    taskById = new Map(tasks.map((task) => [task.id, task]));
    renderBoard();
  } catch (error) {
    console.error(error);
    showMessage('Kunde inte ladda tavlan. Kontrollera att API-servern är igång.');
  }
}

// Uppdaterar en task via PATCH med valfri payload.
const patchTask = async (taskId: string, body: Record<string, unknown>): Promise<void> =>
  requestNoBody(`/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Tar bort en task via API.
const deleteTask = async (taskId: string): Promise<void> =>
  requestNoBody(`/tasks/${taskId}`, { method: 'DELETE' });

// Hanterar knapp-actions och blockerar start utan ansvarig
async function handleTaskAction(action: TaskAction, taskId: string): Promise<void> {
  const task = taskById.get(taskId);
  if (!task) return;

  if (action === 'start') {
    // kontrolleras användare är tilldelad
    const canStart = Boolean(task.assignedTo && task.assignedTo.trim().length > 0);
    if (!canStart) {
      showMessage('Projektet kan inte startas utan tilldelad ansvarig.');
      return;
    }
    await patchTask(taskId, { status: 'doing' });
    return;
  }

  if (action === 'complete') {
    await patchTask(taskId, { status: 'done' });
    return;
  }

  await deleteTask(taskId);
}

// Fångar klick på dynamiska knappar i tavlan med event delegation
board?.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('button[data-action][data-task-id]');
  if (!button) return;

  const action = button.dataset.action;
  const taskId = button.dataset.taskId;
  if (!action || !taskId) return;
  if (action !== 'start' && action !== 'complete' && action !== 'delete') return;

  try {
    clearMessage();
    await handleTaskAction(action, taskId);
    await loadBoard();
  } catch (error) {
    console.error(error);
    showMessage('Något gick fel. Försök igen.');
  }
});

// Fångar ändringar i tilldelningslistor och sparar ansvarig
board?.addEventListener('change', async (event) => {
  const target = event.target as HTMLElement;
  const select = target.closest<HTMLSelectElement>('select[data-action="assign"][data-task-id]');
  if (!select) return;

  const taskId = select.dataset.taskId;
  if (!taskId) return;

  try {
    clearMessage();
    const selectedMemberId = select.value.trim();
    await patchTask(taskId, { assignedTo: selectedMemberId.length > 0 ? selectedMemberId : null });
    await loadBoard();
  } catch (error) {
    console.error(error);
    showMessage('Kunde inte uppdatera ansvarig.');
  }
});

// Hanterar formuläret för att skapa nya uppgifter
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
    showMessage('Titel och beskrivning måste fyllas i.');
    return;
  }

  try {
    clearMessage();
    await requestNoBody('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, category }),
    });
    taskForm.reset();
    await loadBoard();
  } catch (error) {
    console.error(error);
    showMessage('Kunde inte skapa uppgift.');
  }
});

// Hanterar formuläret för att skapa nya medlemmar
const memberForm = document.getElementById('member-form') as HTMLFormElement | null;
memberForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const nameInput = document.getElementById('member-name') as HTMLInputElement | null;
  const categoryInput = document.getElementById('member-category') as HTMLSelectElement | null;
  if (!nameInput || !categoryInput) return;

  const name = nameInput.value.trim();
  const category = categoryInput.value as TaskCategory;
  if (!name) {
    showMessage('Namn måste fyllas i.');
    return;
  }

  try {
    clearMessage();
    await requestNoBody('/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category }),
    });
    memberForm.reset();
    await loadBoard();
  } catch (error) {
    console.error(error);
    showMessage('Kunde inte skapa medlem.');
  }
});

// Startar första inläsningen av tavlan när sidan öppnas
void loadBoard();

