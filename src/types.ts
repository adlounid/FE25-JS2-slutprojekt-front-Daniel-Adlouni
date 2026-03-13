export interface Member {
    id: string;
    name: string;
    category: string;
}

export interface Task {
    id: string;
    title: string;
    description: string;
    category: string;
    status: string;
    assignedTo: string | null;
    timestamp: string;
}