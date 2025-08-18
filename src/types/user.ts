export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  department: string;
  status: 'active' | 'inactive' | 'pending';
  lastActive: string;
  createdAt: string;
  permissions: Permission[];
}

export interface UserRole {
  id: string;
  name: string;
  description: string;
  level: number; // 1 = Admin, 2 = Manager, 3 = Editor, 4 = Viewer
  permissions: Permission[];
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string; // 'analysis', 'batch', 'scheduled', 'analytics', 'settings', 'users'
  actions: string[]; // 'create', 'read', 'update', 'delete', 'execute'
}

export interface Department {
  id: string;
  name: string;
  description: string;
  userCount: number;
  isCustom?: boolean;
}

export const DEFAULT_ROLES: UserRole[] = [
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Full system access and user management',
    level: 1,
    permissions: [
      { id: 'all', name: 'All Permissions', description: 'Complete system access', resource: '*', actions: ['*'] }
    ]
  },
  {
    id: 'manager',
    name: 'Manager',
    description: 'Department oversight and advanced features',
    level: 2,
    permissions: [
      { id: 'analysis_all', name: 'Analysis Management', description: 'Full analysis access', resource: 'analysis', actions: ['create', 'read', 'update', 'delete', 'execute'] },
      { id: 'batch_all', name: 'Batch Management', description: 'Full batch access', resource: 'batch', actions: ['create', 'read', 'update', 'delete', 'execute'] },
      { id: 'scheduled_all', name: 'Schedule Management', description: 'Full scheduling access', resource: 'scheduled', actions: ['create', 'read', 'update', 'delete', 'execute'] },
      { id: 'analytics_read', name: 'Analytics Access', description: 'View analytics and reports', resource: 'analytics', actions: ['read'] },
      { id: 'users_read', name: 'User Viewing', description: 'View team members', resource: 'users', actions: ['read'] }
    ]
  },
  {
    id: 'editor',
    name: 'Editor',
    description: 'Content analysis and review capabilities',
    level: 3,
    permissions: [
      { id: 'analysis_execute', name: 'Content Analysis', description: 'Analyze content for hallucinations', resource: 'analysis', actions: ['create', 'read', 'execute'] },
      { id: 'batch_execute', name: 'Batch Analysis', description: 'Run batch analysis', resource: 'batch', actions: ['create', 'read', 'execute'] },
      { id: 'scheduled_read', name: 'Schedule Viewing', description: 'View scheduled scans', resource: 'scheduled', actions: ['read'] }
    ]
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to results and reports',
    level: 4,
    permissions: [
      { id: 'analysis_read', name: 'View Results', description: 'View analysis results', resource: 'analysis', actions: ['read'] },
      { id: 'analytics_read', name: 'View Analytics', description: 'View reports and analytics', resource: 'analytics', actions: ['read'] }
    ]
  }
];

export const getDefaultDepartments = (): Department[] => [
  { id: 'marketing', name: 'Marketing', description: 'Marketing and communications team', userCount: 0, isCustom: false },
  { id: 'support', name: 'Customer Support', description: 'Customer service and support', userCount: 0, isCustom: false },
  { id: 'content', name: 'Content Team', description: 'Content creation and management', userCount: 0, isCustom: false },
  { id: 'research', name: 'Research', description: 'Research and development', userCount: 0, isCustom: false },
  { id: 'sales', name: 'Sales', description: 'Sales and business development', userCount: 0, isCustom: false },
  { id: 'engineering', name: 'Engineering', description: 'Technical and engineering team', userCount: 0, isCustom: false },
  { id: 'operations', name: 'Operations', description: 'Business operations and management', userCount: 0, isCustom: false }
];