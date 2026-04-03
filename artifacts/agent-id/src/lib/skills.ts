export type SkillCategory =
  | 'Research'
  | 'Code'
  | 'Data'
  | 'Content'
  | 'Support'
  | 'Finance'
  | 'Media'
  | 'Productivity'
  | 'Legal'
  | 'Charity & Social Good';

export interface Skill {
  id: string;
  label: string;
  icon: string;
  category: SkillCategory;
}

export const SKILLS_LIBRARY: Skill[] = [
  { id: 'web-search', label: 'Web Search', icon: '🔍', category: 'Research' },
  { id: 'competitive-analysis', label: 'Competitive Analysis', icon: '📊', category: 'Research' },
  { id: 'market-research', label: 'Market Research', icon: '📈', category: 'Research' },
  { id: 'fact-checking', label: 'Fact Checking', icon: '✅', category: 'Research' },
  { id: 'citation-generation', label: 'Citation Generation', icon: '📝', category: 'Research' },
  { id: 'academic-research', label: 'Academic Research', icon: '🎓', category: 'Research' },
  { id: 'literature-review', label: 'Literature Review', icon: '📚', category: 'Research' },
  { id: 'web-browsing', label: 'Web Browsing', icon: '🌐', category: 'Research' },

  { id: 'code-generation', label: 'Code Generation', icon: '💻', category: 'Code' },
  { id: 'debugging', label: 'Debugging', icon: '🐛', category: 'Code' },
  { id: 'code-review', label: 'Code Review', icon: '🔎', category: 'Code' },
  { id: 'api-integration', label: 'API Integration', icon: '⚡', category: 'Code' },
  { id: 'test-writing', label: 'Test Writing', icon: '🧪', category: 'Code' },
  { id: 'devops', label: 'DevOps', icon: '⚙️', category: 'Code' },
  { id: 'infrastructure', label: 'Infrastructure', icon: '🏗️', category: 'Code' },
  { id: 'security-auditing', label: 'Security Auditing', icon: '🔒', category: 'Code' },

  { id: 'data-analysis', label: 'Data Analysis', icon: '📊', category: 'Data' },
  { id: 'web-scraping', label: 'Web Scraping', icon: '🕷️', category: 'Data' },
  { id: 'etl-pipelines', label: 'ETL/Pipelines', icon: '🔄', category: 'Data' },
  { id: 'sql-queries', label: 'SQL Queries', icon: '🗄️', category: 'Data' },
  { id: 'forecasting', label: 'Forecasting', icon: '🔮', category: 'Data' },
  { id: 'data-visualization', label: 'Data Visualization', icon: '📉', category: 'Data' },
  { id: 'ml-modeling', label: 'ML Modeling', icon: '🤖', category: 'Data' },
  { id: 'data-cleaning', label: 'Data Cleaning', icon: '🧹', category: 'Data' },

  { id: 'copywriting', label: 'Copywriting', icon: '✍️', category: 'Content' },
  { id: 'seo-optimization', label: 'SEO Optimization', icon: '🚀', category: 'Content' },
  { id: 'translation', label: 'Translation', icon: '🌍', category: 'Content' },
  { id: 'summarization', label: 'Summarization', icon: '📋', category: 'Content' },
  { id: 'proofreading', label: 'Proofreading', icon: '🖊️', category: 'Content' },
  { id: 'social-media', label: 'Social Media', icon: '📱', category: 'Content' },
  { id: 'newsletter-writing', label: 'Newsletter Writing', icon: '📰', category: 'Content' },
  { id: 'blog-writing', label: 'Blog Writing', icon: '📝', category: 'Content' },

  { id: 'customer-support', label: 'Customer Support', icon: '💬', category: 'Support' },
  { id: 'ticket-routing', label: 'Ticket Routing', icon: '🎫', category: 'Support' },
  { id: 'onboarding-automation', label: 'Onboarding Automation', icon: '🛬', category: 'Support' },
  { id: 'faq-automation', label: 'FAQ Automation', icon: '❓', category: 'Support' },
  { id: 'escalation-management', label: 'Escalation Management', icon: '🚨', category: 'Support' },
  { id: 'live-chat', label: 'Live Chat', icon: '💭', category: 'Support' },
  { id: 'sentiment-analysis', label: 'Sentiment Analysis', icon: '😊', category: 'Support' },

  { id: 'bookkeeping', label: 'Bookkeeping', icon: '📒', category: 'Finance' },
  { id: 'invoice-processing', label: 'Invoice Processing', icon: '🧾', category: 'Finance' },
  { id: 'budget-analysis', label: 'Budget Analysis', icon: '💰', category: 'Finance' },
  { id: 'expense-tracking', label: 'Expense Tracking', icon: '💳', category: 'Finance' },
  { id: 'financial-modeling', label: 'Financial Modeling', icon: '📐', category: 'Finance' },
  { id: 'tax-preparation', label: 'Tax Preparation', icon: '🏦', category: 'Finance' },
  { id: 'payroll', label: 'Payroll', icon: '💵', category: 'Finance' },

  { id: 'image-generation', label: 'Image Generation', icon: '🎨', category: 'Media' },
  { id: 'video-editing', label: 'Video Editing', icon: '🎬', category: 'Media' },
  { id: 'transcription', label: 'Transcription', icon: '🎙️', category: 'Media' },
  { id: 'podcast-production', label: 'Podcast Production', icon: '🎧', category: 'Media' },
  { id: 'audio-speech', label: 'Audio/Speech', icon: '🔊', category: 'Media' },
  { id: 'graphic-design', label: 'Graphic Design', icon: '🖼️', category: 'Media' },
  { id: 'thumbnail-creation', label: 'Thumbnail Creation', icon: '🖼️', category: 'Media' },

  { id: 'scheduling', label: 'Scheduling', icon: '📅', category: 'Productivity' },
  { id: 'email-drafting', label: 'Email Drafting', icon: '✉️', category: 'Productivity' },
  { id: 'meeting-notes', label: 'Meeting Notes', icon: '📓', category: 'Productivity' },
  { id: 'crm-updates', label: 'CRM Updates', icon: '🗂️', category: 'Productivity' },
  { id: 'calendar-management', label: 'Calendar Management', icon: '🗓️', category: 'Productivity' },
  { id: 'task-automation', label: 'Task Automation', icon: '⚡', category: 'Productivity' },
  { id: 'document-generation', label: 'Document Generation', icon: '📄', category: 'Productivity' },

  { id: 'contract-review', label: 'Contract Review', icon: '📜', category: 'Legal' },
  { id: 'policy-drafting', label: 'Policy Drafting', icon: '🏛️', category: 'Legal' },
  { id: 'gdpr-compliance', label: 'GDPR Compliance', icon: '🔐', category: 'Legal' },
  { id: 'legal-research', label: 'Legal Research', icon: '⚖️', category: 'Legal' },
  { id: 'terms-of-service', label: 'Terms of Service', icon: '📑', category: 'Legal' },
  { id: 'ip-monitoring', label: 'IP Monitoring', icon: '🛡️', category: 'Legal' },

  { id: 'grant-writing', label: 'Grant Writing', icon: '🏆', category: 'Charity & Social Good' },
  { id: 'donor-outreach', label: 'Donor Outreach', icon: '🤝', category: 'Charity & Social Good' },
  { id: 'nonprofit-research', label: 'Nonprofit Research', icon: '🔬', category: 'Charity & Social Good' },
  { id: 'impact-reporting', label: 'Impact Reporting', icon: '📊', category: 'Charity & Social Good' },
  { id: 'volunteer-coordination', label: 'Volunteer Coordination', icon: '🙋', category: 'Charity & Social Good' },
  { id: 'fundraising', label: 'Fundraising', icon: '💝', category: 'Charity & Social Good' },
  { id: 'charity-campaign-management', label: 'Charity Campaign Management', icon: '📣', category: 'Charity & Social Good' },
  { id: 'climate-data-analysis', label: 'Climate Data Analysis', icon: '🌡️', category: 'Charity & Social Good' },
  { id: 'accessibility-auditing', label: 'Accessibility Auditing', icon: '♿', category: 'Charity & Social Good' },
  { id: 'community-moderation', label: 'Community Moderation', icon: '🛡️', category: 'Charity & Social Good' },
];

export const SKILLS_BY_ID: Record<string, Skill> = Object.fromEntries(
  SKILLS_LIBRARY.map(s => [s.id, s])
);

export const SKILLS_BY_LABEL: Record<string, Skill> = Object.fromEntries(
  SKILLS_LIBRARY.map(s => [s.label, s])
);

export function getSkillIcon(label: string): string {
  return SKILLS_BY_LABEL[label]?.icon ?? '▸';
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  'Research', 'Code', 'Data', 'Content', 'Support',
  'Finance', 'Media', 'Productivity', 'Legal', 'Charity & Social Good',
];
