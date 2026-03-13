import { Task, Member } from './types.js';

const API_URL = 'http://localhost:3000/api';
let allMembers: Member[] = [];

async function loadBoard() {
    try {
        const tasksRes = await fetch(`${API_URL}/tasks`);
        const tasks: Task[] = await tasksRes.json();

        const membersRes = await fetch(`${API_URL}/members`);
        allMembers = await membersRes.json();

        renderTasks(tasks);
    } catch (error) {
        console.error(error);
    }
}

function renderTasks(tasks: Task[]) {
    const columns = {
        new: document.getElementById('status-new'),
        doing: document.getElementById('status-doing'),
        done: document.getElementById('status-done')
    };

    Object.values(columns).forEach(col => {
        if (col) col.innerHTML = '';
    });

    const counts = { new: 0, doing: 0, done: 0 };

    tasks.forEach(task => {
        const targetColumn = columns[task.status as keyof typeof columns];
        if (targetColumn) {
            counts[task.status as keyof typeof counts]++;
            
            const card = document.createElement('div');
            card.className = 'task-card';
            
            const matchingMembers = allMembers.filter(m => m.category === task.category);
            const memberOptions = matchingMembers.map(m => 
                `<option value="${m.name}" ${task.assignedTo === m.name ? 'selected' : ''}>${m.name}</option>`
            ).join('');

            const isLocked = task.status !== 'new';
            const assignHTML = isLocked 
                ? `<p><strong>Ansvarig:</strong> ${task.assignedTo || 'Ej tilldelad'}</p>`
                : `<div class="assign-section">
                    <label>Tilldela ${task.category.toUpperCase()}:</label>
                    <select onchange="assignMember('${task.id}', this.value)">
                        <option value="">-- Välj person --</option>
                        ${memberOptions}
                    </select>
                   </div>`;

            let moveBtn = '';
            if (task.status === 'new') {
                moveBtn = `<button onclick="updateTaskStatus('${task.id}', 'doing')">Starta</button>`;
            } else if (task.status === 'doing') {
                moveBtn = `<button onclick="updateTaskStatus('${task.id}', 'done')">Färdigställ</button>`;
            }

            const deleteBtn = task.status === 'done' 
                ? `<button onclick="deleteTask('${task.id}')" class="delete-btn">Radera</button>` 
                : `<span class="lock-text">Låst</span>`;

            card.innerHTML = `
                <h4>${task.title}</h4>
                <p>${task.description}</p>
                ${assignHTML}
                <div class="actions">
                    ${moveBtn}
                    ${deleteBtn}
                </div>
                <div class="task-footer">
                    <small class="timestamp">Skapad: ${task.timestamp}</small>
                </div>
            `;
            targetColumn.appendChild(card);
        }
    });

    const cNew = document.getElementById('count-new');
    const cDoing = document.getElementById('count-doing');
    const cDone = document.getElementById('count-done');

    if (cNew) cNew.textContent = counts.new.toString();
    if (cDoing) cDoing.textContent = counts.doing.toString();
    if (cDone) cDone.textContent = counts.done.toString();
}

const taskForm = document.getElementById('task-form') as HTMLFormElement;
taskForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = (document.getElementById('task-title') as HTMLInputElement).value;
    const description = (document.getElementById('task-desc') as HTMLInputElement).value;
    const category = (document.getElementById('task-category') as HTMLSelectElement).value;

    await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category })
    });
    taskForm.reset();
    loadBoard();
});

const memberForm = document.getElementById('member-form') as HTMLFormElement;
memberForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (document.getElementById('member-name') as HTMLInputElement).value;
    const category = (document.getElementById('member-category') as HTMLSelectElement).value;

    await fetch(`${API_URL}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category })
    });
    memberForm.reset();
    loadBoard();
});

(window as any).updateTaskStatus = async (id: string, newStatus: string) => {
    await fetch(`${API_URL}/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    });
    loadBoard();
};

(window as any).assignMember = async (id: string, memberName: string) => {
    await fetch(`${API_URL}/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo: memberName })
    });
    loadBoard();
};

(window as any).deleteTask = async (id: string) => {
    await fetch(`${API_URL}/tasks/${id}`, { method: 'DELETE' });
    loadBoard();
};

loadBoard();