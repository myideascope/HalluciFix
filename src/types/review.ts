export interface ContentReview {
  id: string;
  analysis_result_id: string;
  user_id: string; // User who created the review request
  assigned_to?: string; // User assigned to review
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'needs_revision';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  reviewer_notes?: string;
  decision_reason?: string;
  created_at: string;
  updated_at: string;
  due_date?: string;
  tags?: string[];
  original_content: string;
  flagged_issues: Array<{
    text: string;
    type: string;
    confidence: number;
    explanation: string;
  }>;
}

export interface ReviewComment {
  id: string;
  review_id: string;
  user_id: string;
  user_name: string;
  comment: string;
  created_at: string;
  is_internal: boolean; // Internal team comment vs client-facing
}

export interface ReviewAssignment {
  id: string;
  review_id: string;
  assigned_by: string;
  assigned_to: string;
  assigned_at: string;
  message?: string;
}

export const REVIEW_STATUSES = [
  { value: 'pending', label: 'Pending Review', color: 'bg-amber-100 text-amber-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { value: 'approved', label: 'Approved', color: 'bg-green-100 text-green-800' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-800' },
  { value: 'needs_revision', label: 'Needs Revision', color: 'bg-orange-100 text-orange-800' }
];

export const REVIEW_PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-800' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-800' }
];