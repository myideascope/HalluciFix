import React, { useState, useEffect } from 'react';
import { 
  Eye, 
  User, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  MessageSquare, 
  UserPlus,
  Filter,
  Search,
  Calendar,
  Flag,
  FileText,
  Send,
  Edit3,
  Trash2,
  Plus
} from 'lucide-react';
import { ContentReview, ReviewComment, REVIEW_STATUSES, REVIEW_PRIORITIES } from '../types/review';
import { AnalysisResult } from '../types/analysis';
import { User as UserType } from '../types/user';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from './Toast';

interface ReviewSystemProps {
  analysisResults: AnalysisResult[];
}

const ReviewSystem: React.FC<ReviewSystemProps> = ({ analysisResults }) => {
  const [reviews, setReviews] = useState<ContentReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<ContentReview | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const { user } = useAuth();
  const { toasts, removeToast, showSuccess, showError, showWarning } = useToast();

  // Mock team members for assignment
  const teamMembers: UserType[] = [
    {
      id: '1',
      email: 'reviewer1@company.com',
      name: 'Sarah Johnson',
      role: { id: 'editor', name: 'Content Editor', description: 'Content review specialist', level: 3, permissions: [] },
      department: 'Content Team',
      status: 'active',
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      permissions: []
    },
    {
      id: '2',
      email: 'reviewer2@company.com',
      name: 'Mike Chen',
      role: { id: 'manager', name: 'Content Manager', description: 'Senior content reviewer', level: 2, permissions: [] },
      department: 'Content Team',
      status: 'active',
      lastActive: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      permissions: []
    }
  ];

  // Initialize with mock reviews from high-risk analysis results
  useEffect(() => {
    const highRiskResults = analysisResults.filter(result => 
      result.riskLevel === 'high' || result.riskLevel === 'critical'
    );

    const mockReviews: ContentReview[] = highRiskResults.slice(0, 5).map((result, index) => ({
      id: `review_${result.id}`,
      analysis_result_id: result.id,
      user_id: user?.id || 'system',
      assigned_to: index % 2 === 0 ? teamMembers[0].id : undefined,
      status: ['pending', 'in_progress', 'approved'][index % 3] as any,
      priority: result.riskLevel === 'critical' ? 'critical' : 'high',
      title: `Review: ${result.content.substring(0, 50)}...`,
      description: `Content flagged with ${result.hallucinations.length} potential issues requiring human review.`,
      created_at: result.timestamp,
      updated_at: result.timestamp,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['ai-generated', result.riskLevel],
      original_content: result.fullContent || result.content,
      flagged_issues: result.hallucinations
    }));

    setReviews(mockReviews);
  }, [analysisResults, user]);

  const createReviewFromResult = (result: AnalysisResult) => {
    if (!user) return;

    const newReview: ContentReview = {
      id: `review_${Date.now()}`,
      analysis_result_id: result.id,
      user_id: user.id,
      status: 'pending',
      priority: result.riskLevel === 'critical' ? 'critical' : result.riskLevel === 'high' ? 'high' : 'medium',
      title: `Review: ${result.content.substring(0, 50)}...`,
      description: `Content flagged with ${result.hallucinations.length} potential issues requiring human review.`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      tags: ['ai-generated', result.riskLevel],
      original_content: result.fullContent || result.content,
      flagged_issues: result.hallucinations
    };

    setReviews(prev => [newReview, ...prev]);
    showSuccess('Review Created', 'Content has been flagged for review.');
  };

  const assignReview = (reviewId: string, assigneeId: string, message?: string) => {
    setReviews(prev => prev.map(review => 
      review.id === reviewId 
        ? { 
            ...review, 
            assigned_to: assigneeId, 
            status: 'in_progress',
            updated_at: new Date().toISOString()
          }
        : review
    ));

    const assignee = teamMembers.find(member => member.id === assigneeId);
    showSuccess('Review Assigned', `Review assigned to ${assignee?.name}`);
    setShowAssignModal(false);
  };

  const updateReviewStatus = (reviewId: string, status: ContentReview['status'], reason?: string) => {
    setReviews(prev => prev.map(review => 
      review.id === reviewId 
        ? { 
            ...review, 
            status, 
            decision_reason: reason,
            updated_at: new Date().toISOString()
          }
        : review
    ));

    const statusLabel = REVIEW_STATUSES.find(s => s.value === status)?.label;
    showSuccess('Review Updated', `Review status changed to ${statusLabel}`);
  };

  const addComment = (reviewId: string) => {
    if (!newComment.trim() || !user) return;

    const comment: ReviewComment = {
      id: `comment_${Date.now()}`,
      review_id: reviewId,
      user_id: user.id,
      user_name: user.name,
      comment: newComment,
      created_at: new Date().toISOString(),
      is_internal: true
    };

    setComments(prev => [...prev, comment]);
    setNewComment('');
    showSuccess('Comment Added', 'Your comment has been added to the review.');
  };

  const filteredReviews = reviews.filter(review => {
    const matchesStatus = filterStatus === 'all' || review.status === filterStatus;
    const matchesPriority = filterPriority === 'all' || review.priority === filterPriority;
    const matchesSearch = review.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         review.original_content.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    return REVIEW_STATUSES.find(s => s.value === status)?.color || 'bg-slate-100 text-slate-800';
  };

  const getPriorityColor = (priority: string) => {
    return REVIEW_PRIORITIES.find(p => p.value === priority)?.color || 'bg-slate-100 text-slate-800';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'in_progress': return <Eye className="w-4 h-4" />;
      case 'approved': return <CheckCircle2 className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
      case 'needs_revision': return <AlertTriangle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-8">
      <ToastContainer toasts={toasts} onClose={removeToast} />

      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Content Review System</h2>
            <p className="text-slate-600 dark:text-slate-400">Manage and track content reviews for flagged AI-generated content.</p>
          </div>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Review</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Reviews</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{reviews.length}</p>
              </div>
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Pending</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {reviews.filter(r => r.status === 'pending').length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-amber-400" />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">In Progress</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {reviews.filter(r => r.status === 'in_progress').length}
                </p>
              </div>
              <Eye className="w-8 h-8 text-blue-400" />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Critical</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {reviews.filter(r => r.priority === 'critical').length}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reviews..."
                className="pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="all">All Status</option>
              {REVIEW_STATUSES.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>

            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="all">All Priority</option>
              {REVIEW_PRIORITIES.map(priority => (
                <option key={priority.value} value={priority.value}>{priority.label}</option>
              ))}
            </select>
          </div>

          <div className="text-sm text-slate-600 dark:text-slate-400">
            {filteredReviews.length} of {reviews.length} reviews
          </div>
        </div>
      </div>

      {/* Reviews List */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors duration-200">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-6">Content Reviews</h3>
        
        <div className="space-y-4">
          {filteredReviews.map((review) => {
            const assignee = teamMembers.find(member => member.id === review.assigned_to);
            
            return (
              <div key={review.id} className="border border-slate-200 dark:border-slate-600 rounded-lg p-6 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getStatusIcon(review.status)}
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100">{review.title}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(review.status)}`}>
                        {REVIEW_STATUSES.find(s => s.value === review.status)?.label}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(review.priority)}`}>
                        {REVIEW_PRIORITIES.find(p => p.value === review.priority)?.label}
                      </span>
                    </div>
                    
                    <p className="text-slate-600 dark:text-slate-400 mb-3">{review.description}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Assigned To</p>
                        <p className="text-sm text-slate-900 dark:text-slate-100">
                          {assignee ? assignee.name : 'Unassigned'}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Due Date</p>
                        <p className="text-sm text-slate-900 dark:text-slate-100">
                          {review.due_date ? new Date(review.due_date).toLocaleDateString() : 'No due date'}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Issues Found</p>
                        <p className="text-sm text-slate-900 dark:text-slate-100">
                          {review.flagged_issues.length} potential issues
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {review.tags?.map((tag, index) => (
                        <span key={index} className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => setSelectedReview(review)}
                      className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg transition-colors"
                      title="View details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={() => {
                        setSelectedReview(review);
                        setShowAssignModal(true);
                      }}
                      className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      title="Assign reviewer"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                    
                    {review.status === 'in_progress' && (
                      <>
                        <button
                          onClick={() => updateReviewStatus(review.id, 'approved')}
                          className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                          title="Approve"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => updateReviewStatus(review.id, 'rejected')}
                          className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Reject"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          
          {filteredReviews.length === 0 && (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">No Reviews Found</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {reviews.length === 0 
                  ? 'No content reviews have been created yet.'
                  : 'No reviews match your current filters.'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Review Detail Modal */}
      {selectedReview && !showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{selectedReview.title}</h3>
                <button
                  onClick={() => setSelectedReview(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Content */}
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Original Content</h4>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {selectedReview.original_content}
                    </p>
                  </div>
                  
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 mt-6">Flagged Issues</h4>
                  <div className="space-y-3">
                    {selectedReview.flagged_issues.map((issue, index) => (
                      <div key={index} className="border border-red-200 dark:border-red-800 rounded-lg p-3 bg-red-50 dark:bg-red-900/20">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-red-900 dark:text-red-100">{issue.type}</span>
                          <span className="text-sm text-red-600 dark:text-red-400">
                            {(issue.confidence * 100).toFixed(0)}% confidence
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-800 rounded p-2 mb-2">
                          <code className="text-sm text-red-800 dark:text-red-200">"{issue.text}"</code>
                        </div>
                        <p className="text-sm text-red-700 dark:text-red-300">{issue.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Review Details */}
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Review Details</h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Status</p>
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(selectedReview.status)}`}>
                          {REVIEW_STATUSES.find(s => s.value === selectedReview.status)?.label}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Priority</p>
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getPriorityColor(selectedReview.priority)}`}>
                          {REVIEW_PRIORITIES.find(p => p.value === selectedReview.priority)?.label}
                        </span>
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Assigned To</p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {teamMembers.find(m => m.id === selectedReview.assigned_to)?.name || 'Unassigned'}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Due Date</p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {selectedReview.due_date ? new Date(selectedReview.due_date).toLocaleDateString() : 'No due date'}
                      </p>
                    </div>
                    
                    {selectedReview.decision_reason && (
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Decision Reason</p>
                        <p className="text-sm text-slate-900 dark:text-slate-100">{selectedReview.decision_reason}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Comments */}
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 mt-6">Comments</h4>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {comments.filter(c => c.review_id === selectedReview.id).map((comment) => (
                      <div key={comment.id} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{comment.user_name}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(comment.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300">{comment.comment}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex items-center space-x-2 mt-4">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      className="flex-1 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      onClick={() => addComment(selectedReview.id)}
                      disabled={!newComment.trim()}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignModal && selectedReview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Assign Review</h3>
            </div>
            
            <div className="p-6">
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                Assign "{selectedReview.title}" to a team member for review.
              </p>
              
              <div className="space-y-3">
                {teamMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => assignReview(selectedReview.id, member.id)}
                    className="w-full flex items-center space-x-3 p-3 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="w-8 h-8 bg-slate-300 dark:bg-slate-600 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{member.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{member.role.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewSystem;