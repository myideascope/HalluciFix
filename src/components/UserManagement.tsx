import React, { useState } from 'react';
import { Users, Plus, Edit2, Trash2, Shield, Mail, Calendar, Search, Filter, MoreVertical, UserPlus, Settings as SettingsIcon, Crown, Eye, AlertTriangle, CheckCircle2, Building2 } from 'lucide-react';
import { User, UserRole, Department, DEFAULT_ROLES, getDefaultDepartments } from '../types/user';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './Toast';

const UserManagement: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>(getDefaultDepartments());
  const [users, setUsers] = useState<User[]>([
    {
      id: '1',
      email: 'admin@company.com',
      name: 'System Administrator',
      role: DEFAULT_ROLES[0],
      department: 'Engineering',
      status: 'active',
      lastActive: '2025-01-17 14:30',
      createdAt: '2024-01-01T00:00:00Z',
      permissions: DEFAULT_ROLES[0].permissions
    },
    {
      id: '2',
      email: 'sarah.johnson@company.com',
      name: 'Sarah Johnson',
      role: DEFAULT_ROLES[1],
      department: 'Marketing',
      status: 'active',
      lastActive: '2025-01-17 13:45',
      createdAt: '2024-02-15T00:00:00Z',
      permissions: DEFAULT_ROLES[1].permissions
    },
    {
      id: '3',
      email: 'mike.chen@company.com',
      name: 'Mike Chen',
      role: DEFAULT_ROLES[2],
      department: 'Research',
      status: 'active',
      lastActive: '2025-01-17 12:20',
      createdAt: '2024-03-10T00:00:00Z',
      permissions: DEFAULT_ROLES[2].permissions
    },
    {
      id: '4',
      email: 'emma.davis@company.com',
      name: 'Emma Davis',
      role: DEFAULT_ROLES[2],
      department: 'Content Team',
      status: 'active',
      lastActive: '2025-01-17 11:15',
      createdAt: '2024-04-20T00:00:00Z',
      permissions: DEFAULT_ROLES[2].permissions
    },
    {
      id: '5',
      email: 'james.wilson@company.com',
      name: 'James Wilson',
      role: DEFAULT_ROLES[3],
      department: 'Sales',
      status: 'inactive',
      lastActive: '2025-01-10 16:30',
      createdAt: '2024-05-05T00:00:00Z',
      permissions: DEFAULT_ROLES[3].permissions
    }
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [newDepartment, setNewDepartment] = useState({
    name: '',
    description: ''
  });
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  
  const [inviteForm, setInviteForm] = useState({
    email: '',
    name: '',
    role: DEFAULT_ROLES[3].id,
    department: departments[0]?.name || 'Engineering'
  });

  const { toasts, removeToast, showSuccess, showError, showWarning } = useToast();

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role.id === filterRole;
    const matchesDepartment = filterDepartment === 'all' || user.department === filterDepartment;
    const matchesStatus = filterStatus === 'all' || user.status === filterStatus;
    
    return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
  });

  const handleInviteUser = () => {
    if (!inviteForm.email || !inviteForm.name) {
      showError('Validation Error', 'Please fill in all required fields.');
      return;
    }

    // Check if user already exists
    const existingUser = users.find(u => u.email.toLowerCase() === inviteForm.email.toLowerCase());
    if (existingUser) {
      showError('User Exists', 'A user with this email address already exists.');
      return;
    }

    const selectedRole = DEFAULT_ROLES.find(r => r.id === inviteForm.role) || DEFAULT_ROLES[3];
    const newUser: User = {
      id: Date.now().toString(),
      email: inviteForm.email,
      name: inviteForm.name,
      role: selectedRole,
      department: inviteForm.department,
      status: 'pending',
      lastActive: 'Never',
      createdAt: new Date().toISOString(),
      permissions: selectedRole.permissions
    };

    setUsers(prev => [...prev, newUser]);
    setShowInviteModal(false);
    showSuccess('Invitation Sent', `Invitation sent to ${inviteForm.email}`);
    
    setInviteForm({
      email: '',
      name: '',
      role: DEFAULT_ROLES[3].id,
      department: departments[0]?.name || 'Engineering'
    });
  };

  const handleCreateDepartment = () => {
    if (!newDepartment.name.trim() || !newDepartment.description.trim()) {
      showError('Validation Error', 'Please fill in all required fields.');
      return;
    }

    const existingDept = departments.find(d => d.name.toLowerCase() === newDepartment.name.toLowerCase());
    if (existingDept) {
      showError('Department Exists', 'A department with this name already exists.');
      return;
    }

    const department: Department = {
      id: Date.now().toString(),
      name: newDepartment.name,
      description: newDepartment.description,
      userCount: 0,
      isCustom: true
    };

    setDepartments(prev => [...prev, department]);
    setShowDepartmentModal(false);
    showSuccess('Department Created', `${newDepartment.name} department has been created.`);
    setNewDepartment({ name: '', description: '' });
    });
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setShowEditModal(true);
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;

    setUsers(prev => prev.map(u => u.id === editingUser.id ? editingUser : u));
    setShowEditModal(false);
    showSuccess('User Updated', `${editingUser.name}'s profile has been updated.`);
    setEditingUser(null);
  };

  const handleDeleteUser = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    if (user.role.level === 1) {
      showWarning('Cannot Delete Admin', 'Administrator accounts cannot be deleted.');
      return;
    }

    setUsers(prev => prev.filter(u => u.id !== userId));
    showSuccess('User Removed', `${user.name} has been removed from the system.`);
  };

  const handleToggleUserStatus = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    setUsers(prev => prev.map(u => 
      u.id === userId ? { ...u, status: newStatus } : u
    ));
    
    showSuccess(
      'Status Updated', 
      `${user.name} has been ${newStatus === 'active' ? 'activated' : 'deactivated'}.`
    );
  };

  const handleDeleteDepartment = (deptId: string) => {
    const department = departments.find(d => d.id === deptId);
    if (!department?.isCustom) {
      showWarning('Cannot Delete', 'Default departments cannot be deleted.');
      return;
    }
    setDepartments(prev => prev.filter(d => d.id !== deptId));
    showSuccess('Department Deleted', `${department.name} has been removed.`);
  };

  const handleBulkAction = (action: string) => {
    if (selectedUsers.length === 0) {
      showWarning('No Selection', 'Please select users to perform bulk actions.');
      return;
    }

    switch (action) {
      case 'activate':
        setUsers(prev => prev.map(u => 
          selectedUsers.includes(u.id) ? { ...u, status: 'active' as const } : u
        ));
        showSuccess('Bulk Update', `${selectedUsers.length} users activated.`);
        break;
      case 'deactivate':
        setUsers(prev => prev.map(u => 
          selectedUsers.includes(u.id) && u.role.level > 1 ? { ...u, status: 'inactive' as const } : u
        ));
        showSuccess('Bulk Update', `${selectedUsers.length} users deactivated.`);
        break;
      case 'delete':
        const nonAdminUsers = selectedUsers.filter(id => {
          const user = users.find(u => u.id === id);
          return user && user.role.level > 1;
        });
        setUsers(prev => prev.filter(u => !nonAdminUsers.includes(u.id)));
        showSuccess('Bulk Delete', `${nonAdminUsers.length} users removed.`);
        break;
    }
    setSelectedUsers([]);
  };

  const getRoleIcon = (role: UserRole) => {
    switch (role.level) {
      case 1: return <Crown className="w-4 h-4 text-yellow-600" />;
      case 2: return <Shield className="w-4 h-4 text-blue-600" />;
      case 3: return <Edit2 className="w-4 h-4 text-green-600" />;
      case 4: return <Eye className="w-4 h-4 text-slate-600" />;
      default: return <Users className="w-4 h-4 text-slate-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-700 bg-green-100';
      case 'inactive': return 'text-slate-700 bg-slate-100';
      case 'pending': return 'text-amber-700 bg-amber-100';
      default: return 'text-slate-700 bg-slate-100';
    }
  };

  const getRoleColor = (level: number) => {
    switch (level) {
      case 1: return 'text-yellow-700 bg-yellow-100';
      case 2: return 'text-blue-700 bg-blue-100';
      case 3: return 'text-green-700 bg-green-100';
      case 4: return 'text-slate-700 bg-slate-100';
      default: return 'text-slate-700 bg-slate-100';
    }
  };

  return (
    <div className="space-y-8">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">User Management</h2>
            <p className="text-slate-600">Manage team members, roles, and permissions across your organization.</p>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowDepartmentModal(true)}
              className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <Building2 className="w-4 h-4" />
              <span>Manage Departments</span>
            </button>
            
            <button
              onClick={() => setShowRoleModal(true)}
              className="flex items-center space-x-2 px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <SettingsIcon className="w-4 h-4" />
              <span>Manage Roles</span>
            </button>
            
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite User</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total Users</p>
                <p className="text-2xl font-bold text-slate-900">{users.length}</p>
              </div>
              <Users className="w-8 h-8 text-slate-400" />
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Active Users</p>
                <p className="text-2xl font-bold text-slate-900">
                  {users.filter(u => u.status === 'active').length}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Pending Invites</p>
                <p className="text-2xl font-bold text-slate-900">
                  {users.filter(u => u.status === 'pending').length}
                </p>
              </div>
              <Mail className="w-8 h-8 text-amber-400" />
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Departments</p>
                <p className="text-2xl font-bold text-slate-900">{departments.length}</p>
              </div>
              <Shield className="w-8 h-8 text-blue-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2"
            >
              <option value="all">All Roles</option>
              {DEFAULT_ROLES.map(role => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>

            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2"
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.name}>{dept.name}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {selectedUsers.length > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-600">{selectedUsers.length} selected</span>
              <button
                onClick={() => handleBulkAction('activate')}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Activate
              </button>
              <button
                onClick={() => handleBulkAction('deactivate')}
                className="px-3 py-1.5 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
              >
                Deactivate
              </button>
              <button
                onClick={() => handleBulkAction('delete')}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 pr-4">
                  <input
                    type="checkbox"
                    checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUsers(filteredUsers.map(u => u.id));
                      } else {
                        setSelectedUsers([]);
                      }
                    }}
                    className="rounded border-slate-300"
                  />
                </th>
                <th className="text-left text-sm font-medium text-slate-600 py-3 pr-4">User</th>
                <th className="text-left text-sm font-medium text-slate-600 py-3 pr-4">Role</th>
                <th className="text-left text-sm font-medium text-slate-600 py-3 pr-4">Department</th>
                <th className="text-left text-sm font-medium text-slate-600 py-3 pr-4">Status</th>
                <th className="text-left text-sm font-medium text-slate-600 py-3 pr-4">Last Active</th>
                <th className="text-left text-sm font-medium text-slate-600 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-4 pr-4">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUsers(prev => [...prev, user.id]);
                        } else {
                          setSelectedUsers(prev => prev.filter(id => id !== user.id));
                        }
                      }}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
                        ) : (
                          <Users className="w-5 h-5 text-slate-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{user.name}</p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex items-center space-x-2">
                      {getRoleIcon(user.role)}
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getRoleColor(user.role.level)}`}>
                        {user.role.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <span className="text-slate-600">{user.department}</span>
                  </td>
                  <td className="py-4 pr-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getStatusColor(user.status)}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <span className="text-sm text-slate-500">{user.lastActive}</span>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Edit user"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      
                      <button
                        onClick={() => handleToggleUserStatus(user.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          user.status === 'active' 
                            ? 'text-amber-600 hover:bg-amber-50' 
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                        title={user.status === 'active' ? 'Deactivate user' : 'Activate user'}
                      >
                        {user.status === 'active' ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                      </button>
                      
                      {user.role.level > 1 && (
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite User Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Invite New User</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="user@company.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                >
                  {DEFAULT_ROLES.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Department</label>
                <select
                  value={inviteForm.department}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                >
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.name}>{dept.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              
              <button
                onClick={handleInviteUser}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Edit User</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                <select
                  value={editingUser.role.id}
                  onChange={(e) => {
                    const newRole = DEFAULT_ROLES.find(r => r.id === e.target.value);
                    if (newRole) {
                      setEditingUser(prev => prev ? { 
                        ...prev, 
                        role: newRole,
                        permissions: newRole.permissions 
                      } : null);
                    }
                  }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                >
                  {DEFAULT_ROLES.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Department</label>
                <select
                  value={editingUser.department}
                  onChange={(e) => setEditingUser(prev => prev ? { ...prev, department: e.target.value } : null)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                >
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.name}>{dept.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              
              <button
                onClick={handleUpdateUser}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Update User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Department Management Modal */}
      {showDepartmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Manage Departments</h3>
            </div>
            
            <div className="p-6">
              {/* Add New Department */}
              <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                <h4 className="font-medium text-slate-900 mb-4">Add New Department</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Department Name</label>
                    <input
                      type="text"
                      value={newDepartment.name}
                      onChange={(e) => setNewDepartment(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2"
                      placeholder="e.g., Legal"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                    <input
                      type="text"
                      value={newDepartment.description}
                      onChange={(e) => setNewDepartment(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2"
                      placeholder="e.g., Legal and compliance team"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreateDepartment}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add Department
                </button>
              </div>

              {/* Existing Departments */}
              <div>
                <h4 className="font-medium text-slate-900 mb-4">Existing Departments</h4>
                <div className="space-y-2">
                  {departments.map((dept) => (
                    <div key={dept.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-900">{dept.name}</p>
                        <p className="text-sm text-slate-600">{dept.description}</p>
                        <p className="text-xs text-slate-500">{dept.userCount} users</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {dept.isCustom ? (
                          <button
                            onClick={() => handleDeleteDepartment(dept.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete department"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">Default</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 flex items-center justify-end">
              <button
                onClick={() => setShowDepartmentModal(false)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;