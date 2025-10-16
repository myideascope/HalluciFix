/**
 * Incident Management Dashboard
 * View and manage incidents, escalations, and notifications
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  User, 
  MessageSquare, 
  ArrowUp, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  Eye,
  Edit,
  Send,
  Filter,
  Search
} from 'lucide-react';
import { 
  incidentManager, 
  Incident, 
  IncidentStatus, 
  IncidentSeverity, 
  IncidentPriority 
} from '../lib/errors/incidentManager';

interface IncidentDashboardProps {
  className?: string;
}

export const IncidentDashboard: React.FC<IncidentDashboardProps> = ({ 
  className = '' 
}) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: [] as IncidentStatus[],
    severity: [] as IncidentSeverity[],
    priority: [] as IncidentPriority[]
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [newComment, setNewComment] = useState('');

  // Load incidents
  useEffect(() => {
    const loadIncidents = () => {
      const allIncidents = incidentManager.getIncidents({
        status: filters.status.length > 0 ? filters.status : undefined,
        severity: filters.severity.length > 0 ? filters.severity : undefined,
        priority: filters.priority.length > 0 ? filters.priority : undefined,
        limit: 100
      });
      
      let filteredIncidents = allIncidents;
      
      if (searchTerm) {
        filteredIncidents = allIncidents.filter(incident =>
          incident.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          incident.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          incident.id.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      
      setIncidents(filteredIncidents);
      setIsLoading(false);
    };

    loadIncidents();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadIncidents, 30000);
    return () => clearInterval(interval);
  }, [filters, searchTerm]);

  const handleStatusChange = (incidentId: string, newStatus: IncidentStatus) => {
    const updated = incidentManager.updateIncident(incidentId, { status: newStatus }, 'user');
    if (updated) {
      setIncidents(prev => prev.map(i => i.id === incidentId ? updated : i));
      if (selectedIncident?.id === incidentId) {
        setSelectedIncident(updated);
      }
    }
  };

  const handleEscalate = (incidentId: string) => {
    const success = incidentManager.escalateIncident(incidentId, 'Manual escalation by user', 'user');
    if (success) {
      const updated = incidentManager.getIncident(incidentId);
      if (updated) {
        setIncidents(prev => prev.map(i => i.id === incidentId ? updated : i));
        if (selectedIncident?.id === incidentId) {
          setSelectedIncident(updated);
        }
      }
    }
  };

  const handleAddComment = (incidentId: string) => {
    if (!newComment.trim()) return;
    
    const success = incidentManager.addIncidentComment(incidentId, newComment, 'user');
    if (success) {
      const updated = incidentManager.getIncident(incidentId);
      if (updated) {
        setIncidents(prev => prev.map(i => i.id === incidentId ? updated : i));
        if (selectedIncident?.id === incidentId) {
          setSelectedIncident(updated);
        }
      }
      setNewComment('');
    }
  };

  const getSeverityColor = (severity: IncidentSeverity) => {
    switch (severity) {
      case IncidentSeverity.CRITICAL:
        return 'text-red-600 bg-red-100';
      case IncidentSeverity.HIGH:
        return 'text-orange-600 bg-orange-100';
      case IncidentSeverity.MEDIUM:
        return 'text-yellow-600 bg-yellow-100';
      case IncidentSeverity.LOW:
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-slate-600 bg-slate-100';
    }
  };

  const getStatusColor = (status: IncidentStatus) => {
    switch (status) {
      case IncidentStatus.OPEN:
        return 'text-red-600 bg-red-100';
      case IncidentStatus.INVESTIGATING:
        return 'text-orange-600 bg-orange-100';
      case IncidentStatus.IDENTIFIED:
        return 'text-yellow-600 bg-yellow-100';
      case IncidentStatus.MONITORING:
        return 'text-blue-600 bg-blue-100';
      case IncidentStatus.RESOLVED:
        return 'text-green-600 bg-green-100';
      case IncidentStatus.CLOSED:
        return 'text-slate-600 bg-slate-100';
      default:
        return 'text-slate-600 bg-slate-100';
    }
  };

  const getPriorityIcon = (priority: IncidentPriority) => {
    const iconClass = priority === IncidentPriority.P1 ? 'text-red-600' :
                     priority === IncidentPriority.P2 ? 'text-orange-600' :
                     priority === IncidentPriority.P3 ? 'text-yellow-600' : 'text-blue-600';
    
    return <AlertTriangle className={`w-4 h-4 ${iconClass}`} />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-slate-600">Loading incidents...</span>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Incident Management</h2>
          <p className="text-slate-600">Monitor and manage system incidents</p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-slate-600">
            {incidents.length} incident{incidents.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-4 rounded-lg border border-slate-200">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search incidents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              multiple
              value={filters.status}
              onChange={(e) => setFilters(prev => ({
                ...prev,
                status: Array.from(e.target.selectedOptions, option => option.value as IncidentStatus)
              }))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              {Object.values(IncidentStatus).map(status => (
                <option key={status} value={status}>
                  {status.replace('_', ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Incidents List */}
        <div className="lg:col-span-2 space-y-4">
          {incidents.length === 0 ? (
            <div className="bg-white p-8 rounded-lg border border-slate-200 text-center">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No incidents found</h3>
              <p className="text-slate-600">All systems are operating normally.</p>
            </div>
          ) : (
            incidents.map((incident) => (
              <div
                key={incident.id}
                className={`bg-white p-6 rounded-lg border border-slate-200 hover:shadow-md transition-shadow cursor-pointer ${
                  selectedIncident?.id === incident.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => setSelectedIncident(incident)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getPriorityIcon(incident.priority)}
                      <span className="font-medium text-slate-900">{incident.title}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(incident.severity)}`}>
                        {incident.severity}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(incident.status)}`}>
                        {incident.status.replace('_', ' ')}
                      </span>
                    </div>
                    
                    <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                      {incident.description}
                    </p>
                    
                    <div className="flex items-center space-x-4 text-xs text-slate-500">
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {new Date(incident.createdAt).toLocaleString()}
                      </span>
                      {incident.assignedTo && (
                        <span className="flex items-center">
                          <User className="w-3 h-3 mr-1" />
                          {incident.assignedTo}
                        </span>
                      )}
                      {incident.escalationLevel > 0 && (
                        <span className="flex items-center text-orange-600">
                          <ArrowUp className="w-3 h-3 mr-1" />
                          Level {incident.escalationLevel}
                        </span>
                      )}
                      <span className="flex items-center">
                        <MessageSquare className="w-3 h-3 mr-1" />
                        {incident.timeline.length} updates
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedIncident(incident);
                      }}
                      className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Incident Details */}
        <div className="lg:col-span-1">
          {selectedIncident ? (
            <div className="bg-white rounded-lg border border-slate-200 sticky top-6">
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Incident Details</h3>
                  <button
                    onClick={() => setSelectedIncident(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">ID</label>
                    <p className="text-sm text-slate-600 font-mono">{selectedIncident.id}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-slate-700">Title</label>
                    <p className="text-sm text-slate-900">{selectedIncident.title}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Severity</label>
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(selectedIncident.severity)}`}>
                        {selectedIncident.severity}
                      </span>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700">Priority</label>
                      <p className="text-sm text-slate-900">{selectedIncident.priority}</p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-slate-700">Status</label>
                    <select
                      value={selectedIncident.status}
                      onChange={(e) => handleStatusChange(selectedIncident.id, e.target.value as IncidentStatus)}
                      className="mt-1 block w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    >
                      {Object.values(IncidentStatus).map(status => (
                        <option key={status} value={status}>
                          {status.replace('_', ' ').toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-slate-700">Description</label>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedIncident.description}</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 border-b border-slate-200">
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEscalate(selectedIncident.id)}
                    className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm"
                  >
                    <ArrowUp className="w-4 h-4" />
                    <span>Escalate</span>
                  </button>
                  {selectedIncident.status !== IncidentStatus.RESOLVED && (
                    <button
                      onClick={() => handleStatusChange(selectedIncident.id, IncidentStatus.RESOLVED)}
                      className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Resolve</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="p-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3">Timeline</h4>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {selectedIncident.timeline.map((entry) => (
                    <div key={entry.id} className="flex space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-medium text-slate-900">{entry.author}</span>
                          <span className="text-xs text-slate-500">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{entry.message}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Comment */}
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddComment(selectedIncident.id)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                      onClick={() => handleAddComment(selectedIncident.id)}
                      disabled={!newComment.trim()}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-8 rounded-lg border border-slate-200 text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">Select an incident</h3>
              <p className="text-slate-600">Choose an incident from the list to view details and manage it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};