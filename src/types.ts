
export type TaskCategory = 'ux' | 'dev frontend' | 'dev backend';
export type TaskStatus = 'new' | 'doing' | 'done';

// Medlemsmodell från backend
export interface Member {
  id: string;
  name: string;
  category: TaskCategory;
}

// Uppgiftsmodell från backend
export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  status: TaskStatus;
  assignedTo: string | null;
  timestamp: string;
}
