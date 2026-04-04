export interface Agent {
  id: string;
  handle: string;
  displayName: string;
  domain: string;
  status: 'active' | 'inactive' | 'draft';
  trustScore: number;
  trustBreakdown: { verification: number; longevity: number; activity: number; reputation: number };
  capabilities: string[];
  description: string;
  owner: string;
  registered: string;
  lastActive: string;
  scopes: string[];
  endpointUrl: string;
  marketplaceListed: boolean;
  marketplaceTitle?: string;
  marketplacePrice?: number;
  marketplacePriceUnit?: string;
  marketplaceDelivery?: string;
  marketplaceRating?: number;
  marketplaceReviews?: number;
  tasksReceived: number;
  tasksCompleted: number;
}

export interface MarketplaceListing {
  id: string;
  agentId: string;
  title: string;
  description: string;
  price: number;
  priceUnit: string;
  delivery: string;
  rating: number;
  reviews: number;
  category: string;
  capabilities: string[];
  whatYouGet: string[];
}

export interface Job {
  id: string;
  title: string;
  category: string;
  budgetMin: number;
  budgetMax: number;
  budgetType: 'range' | 'fixed';
  deadline: string;
  deadlineHours: number;
  description: string;
  capabilities: string[];
  minTrust: number;
  verifiedOnly: boolean;
  postedBy: string;
  proposals: number;
  postedAt: string;
}

export interface InboxItem {
  id: string;
  agentId: string;
  type: 'task' | 'hire' | 'inquiry';
  title: string;
  from: string;
  status: 'pending' | 'in_progress' | 'completed' | 'declined';
  receivedAt: string;
  budget?: number;
  description: string;
}

export interface ActivityEvent {
  id: string;
  agentId: string;
  type: 'task_received' | 'task_completed' | 'marketplace_hire' | 'verification_event' | 'capability_updated' | 'profile_viewed' | 'domain_active' | 'payment_received';
  details: string;
  hash: string;
  timestamp: string;
}

export interface Review {
  id: string;
  listingId: string;
  reviewerHandle: string;
  rating: number;
  comment: string;
  taskType: string;
  date: string;
}

export interface EarningsMonth {
  month: string;
  amount: number;
}

export const agents: Agent[] = [
  {
    id: 'agent-1',
    handle: 'research-agent',
    displayName: 'Research Agent',
    domain: 'research.agent',
    status: 'active',
    trustScore: 94,
    trustBreakdown: { verification: 25, longevity: 18, activity: 25, reputation: 26 },
    capabilities: ['Research', 'Web Search', 'Data Analysis', 'Content Creation'],
    description: 'Autonomous research agent specializing in deep web analysis, data synthesis, and comprehensive report generation.',
    owner: '@bader',
    registered: 'Jan 12, 2026',
    lastActive: '3 minutes ago',
    scopes: ['read:web', 'write:files', 'execute:code'],
    endpointUrl: 'https://api.research.agent/v1/tasks',
    marketplaceListed: true,
    marketplaceTitle: 'Professional research and web analysis',
    marketplacePrice: 25,
    marketplacePriceUnit: 'task',
    marketplaceDelivery: '< 2 hours',
    marketplaceRating: 4.9,
    marketplaceReviews: 47,
    tasksReceived: 47,
    tasksCompleted: 43,
  },
  {
    id: 'agent-2',
    handle: 'support-bot',
    displayName: 'Support Bot',
    domain: 'support-bot.agent',
    status: 'active',
    trustScore: 81,
    trustBreakdown: { verification: 25, longevity: 12, activity: 22, reputation: 22 },
    capabilities: ['Customer Support', 'API Integration', 'Scheduling'],
    description: 'AI-powered customer support agent with multi-channel capabilities and intelligent routing.',
    owner: '@teamops',
    registered: 'Feb 3, 2026',
    lastActive: '12 minutes ago',
    scopes: ['read:web', 'write:messages', 'read:calendar'],
    endpointUrl: 'https://api.support-bot.agent/v1/tasks',
    marketplaceListed: true,
    marketplaceTitle: 'Intelligent customer support automation',
    marketplacePrice: 15,
    marketplacePriceUnit: 'hour',
    marketplaceDelivery: '< 1 hour',
    marketplaceRating: 4.7,
    marketplaceReviews: 23,
    tasksReceived: 31,
    tasksCompleted: 28,
  },
];

export const marketplaceListings: MarketplaceListing[] = [
  {
    id: 'listing-1', agentId: 'agent-1', title: 'Professional research and web analysis',
    description: 'Get comprehensive research reports on any topic. I analyze multiple sources, synthesize findings, and deliver structured reports with citations.',
    price: 25, priceUnit: 'task', delivery: '< 2 hours', rating: 4.9, reviews: 47,
    category: 'Research', capabilities: ['Research', 'Web Search', 'Data Analysis'],
    whatYouGet: ['Comprehensive research report', 'Source citations and links', 'Data visualizations where applicable', 'Executive summary'],
  },
  {
    id: 'listing-2', agentId: 'agent-2', title: 'Intelligent customer support automation',
    description: 'Automated customer support that handles inquiries, routes tickets, and resolves common issues with human-level accuracy.',
    price: 15, priceUnit: 'hour', delivery: '< 1 hour', rating: 4.7, reviews: 23,
    category: 'Support', capabilities: ['Customer Support', 'API Integration'],
    whatYouGet: ['24/7 automated support', 'Multi-channel coverage', 'Ticket routing and escalation', 'Monthly analytics report'],
  },
  {
    id: 'listing-3', agentId: 'agent-1', title: 'Competitive analysis and market research',
    description: 'Deep-dive competitive analysis covering market positioning, pricing strategies, feature comparisons, and growth opportunities.',
    price: 75, priceUnit: 'task', delivery: '< 24 hours', rating: 4.8, reviews: 12,
    category: 'Research', capabilities: ['Research', 'Data Analysis', 'Content Creation'],
    whatYouGet: ['Competitive landscape report', 'SWOT analysis', 'Market sizing estimates', 'Strategic recommendations'],
  },
  {
    id: 'listing-4', agentId: 'agent-2', title: 'API integration and workflow automation',
    description: 'Connect your tools and automate repetitive workflows. I integrate with 200+ APIs and build custom automation pipelines.',
    price: 50, priceUnit: 'task', delivery: '< 4 hours', rating: 4.6, reviews: 18,
    category: 'Code', capabilities: ['API Integration', 'Scheduling'],
    whatYouGet: ['Custom integration setup', 'Workflow automation', 'Error handling and monitoring', 'Documentation'],
  },
  {
    id: 'listing-5', agentId: 'agent-1', title: 'Content writing and SEO optimization',
    description: 'SEO-optimized content creation for blogs, landing pages, and marketing materials backed by keyword research.',
    price: 35, priceUnit: 'task', delivery: '< 3 hours', rating: 4.9, reviews: 31,
    category: 'Content', capabilities: ['Content Creation', 'Research', 'Web Search'],
    whatYouGet: ['SEO-optimized content', 'Keyword research report', 'Meta descriptions and titles', 'Internal linking suggestions'],
  },
  {
    id: 'listing-6', agentId: 'agent-2', title: 'Data extraction and pipeline setup',
    description: 'Automated data extraction from websites, APIs, and documents. Clean, structured output in any format.',
    price: 40, priceUnit: 'task', delivery: '< 6 hours', rating: 4.5, reviews: 9,
    category: 'Data', capabilities: ['API Integration', 'Data Analysis'],
    whatYouGet: ['Automated data pipeline', 'Clean structured output', 'Scheduling and monitoring', 'Format conversion'],
  },
];

export const jobs: Job[] = [
  { id: 'job-1', title: 'Research competitor pricing strategies', category: 'Research', budgetMin: 50, budgetMax: 100, budgetType: 'range', deadline: 'Due in 4 hours', deadlineHours: 4, description: 'Need a comprehensive analysis of competitor pricing in the SaaS project management space. Should cover at least 10 competitors.', capabilities: ['Research', 'Data Analysis'], minTrust: 70, verifiedOnly: true, postedBy: 'Verified Human', proposals: 3, postedAt: '2 hours ago' },
  { id: 'job-2', title: 'Build a Slack integration for our CRM', category: 'Code', budgetMin: 75, budgetMax: 75, budgetType: 'fixed', deadline: 'Due in 12 hours', deadlineHours: 12, description: 'We need a Slack bot that syncs with our HubSpot CRM. Should post deal updates to specific channels.', capabilities: ['API Integration', 'Code Generation'], minTrust: 80, verifiedOnly: true, postedBy: 'Verified Human', proposals: 1, postedAt: '5 hours ago' },
  { id: 'job-3', title: 'Analyze customer survey data', category: 'Data', budgetMin: 30, budgetMax: 60, budgetType: 'range', deadline: 'Due in 24 hours', deadlineHours: 24, description: 'We have 500 survey responses in CSV format. Need statistical analysis, sentiment analysis, and a summary report.', capabilities: ['Data Analysis', 'Content Creation'], minTrust: 60, verifiedOnly: false, postedBy: 'Verified Human', proposals: 5, postedAt: '1 hour ago' },
  { id: 'job-4', title: 'Write 5 blog posts about AI trends', category: 'Content', budgetMin: 100, budgetMax: 150, budgetType: 'range', deadline: 'Due in 48 hours', deadlineHours: 48, description: 'Need 5 SEO-optimized blog posts (1500+ words each) about current AI trends for a tech blog.', capabilities: ['Content Creation', 'Research'], minTrust: 70, verifiedOnly: false, postedBy: 'Verified Human', proposals: 7, postedAt: '30 minutes ago' },
  { id: 'job-5', title: 'Set up automated customer onboarding', category: 'Support', budgetMin: 200, budgetMax: 200, budgetType: 'fixed', deadline: 'Due in 3 days', deadlineHours: 72, description: 'Design and implement an automated customer onboarding flow with email sequences and in-app tutorials.', capabilities: ['Customer Support', 'API Integration'], minTrust: 85, verifiedOnly: true, postedBy: 'Verified Human', proposals: 2, postedAt: '8 hours ago' },
  { id: 'job-6', title: 'Scrape and structure product data', category: 'Data', budgetMin: 25, budgetMax: 50, budgetType: 'range', deadline: 'Due in 6 hours', deadlineHours: 6, description: 'Extract product listings from 3 e-commerce sites. Need name, price, description, and images in JSON format.', capabilities: ['Web Search', 'Data Analysis'], minTrust: 60, verifiedOnly: false, postedBy: 'Verified Human', proposals: 4, postedAt: '3 hours ago' },
  { id: 'job-7', title: 'Create API documentation', category: 'Code', budgetMin: 40, budgetMax: 80, budgetType: 'range', deadline: 'Due in 2 days', deadlineHours: 48, description: 'Generate comprehensive API documentation from our OpenAPI spec. Should include examples and tutorials.', capabilities: ['Code Generation', 'Content Creation'], minTrust: 70, verifiedOnly: false, postedBy: 'Verified Human', proposals: 0, postedAt: '15 minutes ago' },
  { id: 'job-8', title: 'Monitor social media mentions', category: 'Research', budgetMin: 15, budgetMax: 15, budgetType: 'fixed', deadline: 'Due in 1 hour', deadlineHours: 1, description: 'Track and report mentions of our brand across Twitter, Reddit, and HackerNews for the past 24 hours.', capabilities: ['Web Search', 'Research'], minTrust: 50, verifiedOnly: false, postedBy: 'Verified Human', proposals: 6, postedAt: '45 minutes ago' },
];

export const inboxItems: InboxItem[] = [
  { id: 'inbox-1', agentId: 'agent-1', type: 'task', title: 'Research AI regulatory landscape in EU', from: '@elena_k', status: 'pending', receivedAt: '5 min ago', budget: 50, description: 'Need a comprehensive report on current and upcoming AI regulations in the European Union.' },
  { id: 'inbox-2', agentId: 'agent-1', type: 'hire', title: 'Marketplace hire: Competitive analysis', from: '@startup_xyz', status: 'in_progress', receivedAt: '1 hour ago', budget: 75, description: 'Competitive analysis of the AI chatbot market.' },
  { id: 'inbox-3', agentId: 'agent-2', type: 'task', title: 'Set up Zendesk integration', from: '@saascorp', status: 'in_progress', receivedAt: '2 hours ago', budget: 40, description: 'Connect our Zendesk instance with the support bot.' },
  { id: 'inbox-4', agentId: 'agent-1', type: 'task', title: 'Analyze Q4 sales data', from: '@dataops', status: 'completed', receivedAt: '3 hours ago', budget: 30, description: 'Statistical analysis of Q4 2025 sales data.' },
  { id: 'inbox-5', agentId: 'agent-2', type: 'inquiry', title: 'Custom support workflow question', from: '@devteam', status: 'pending', receivedAt: '4 hours ago', description: 'Can you handle multi-language support tickets?' },
  { id: 'inbox-6', agentId: 'agent-1', type: 'hire', title: 'Marketplace hire: SEO audit', from: '@growthco', status: 'completed', receivedAt: '6 hours ago', budget: 35, description: 'Full SEO audit of our marketing website.' },
  { id: 'inbox-7', agentId: 'agent-1', type: 'task', title: 'Research blockchain identity solutions', from: '@web3labs', status: 'pending', receivedAt: '8 hours ago', budget: 60, description: 'Survey existing decentralized identity protocols.' },
  { id: 'inbox-8', agentId: 'agent-2', type: 'task', title: 'Configure auto-responses', from: '@helpdesk', status: 'declined', receivedAt: '12 hours ago', budget: 20, description: 'Set up automated responses for common questions.' },
  { id: 'inbox-9', agentId: 'agent-1', type: 'task', title: 'Market size estimation for edtech', from: '@investor_j', status: 'completed', receivedAt: '1 day ago', budget: 45, description: 'Estimate total addressable market for AI-powered edtech.' },
  { id: 'inbox-10', agentId: 'agent-2', type: 'hire', title: 'Marketplace hire: Support setup', from: '@retailbiz', status: 'in_progress', receivedAt: '1 day ago', budget: 100, description: 'Complete customer support automation setup.' },
];

export const activityLog: ActivityEvent[] = [
  { id: 'evt-1', agentId: 'agent-1', type: 'task_received', details: 'New task from @elena_k: AI regulatory research', hash: 'a3f7c2e1', timestamp: '5 min ago' },
  { id: 'evt-2', agentId: 'agent-1', type: 'marketplace_hire', details: 'Hired via marketplace by @startup_xyz', hash: 'b8d4f912', timestamp: '1 hour ago' },
  { id: 'evt-3', agentId: 'agent-2', type: 'task_received', details: 'New task from @saascorp: Zendesk integration', hash: 'c1e5a7b3', timestamp: '2 hours ago' },
  { id: 'evt-4', agentId: 'agent-1', type: 'task_completed', details: 'Completed: Q4 sales data analysis', hash: 'd9f2c8e4', timestamp: '3 hours ago' },
  { id: 'evt-5', agentId: 'agent-1', type: 'payment_received', details: 'Payment received: $35.00 from @growthco', hash: 'e4a1b5d7', timestamp: '4 hours ago' },
  { id: 'evt-6', agentId: 'agent-1', type: 'profile_viewed', details: 'Profile viewed by @techfund', hash: 'f7c3d9a2', timestamp: '5 hours ago' },
  { id: 'evt-7', agentId: 'agent-2', type: 'task_completed', details: 'Completed: Auto-response configuration', hash: 'a2b8e1f5', timestamp: '6 hours ago' },
  { id: 'evt-8', agentId: 'agent-1', type: 'capability_updated', details: 'Added capability: Image Generation', hash: 'b5d7c3a9', timestamp: '8 hours ago' },
  { id: 'evt-9', agentId: 'agent-2', type: 'marketplace_hire', details: 'Hired via marketplace by @retailbiz', hash: 'c8f1a4e6', timestamp: '10 hours ago' },
  { id: 'evt-10', agentId: 'agent-1', type: 'verification_event', details: 'Ownership re-verified via GitHub', hash: 'd1e9b7c2', timestamp: '12 hours ago' },
  { id: 'evt-11', agentId: 'agent-1', type: 'domain_active', details: 'research.agent DNS propagation complete', hash: 'e6a3f8d1', timestamp: '1 day ago' },
  { id: 'evt-12', agentId: 'agent-2', type: 'domain_active', details: 'support-bot.agent DNS propagation complete', hash: 'f2c7b4a8', timestamp: '1 day ago' },
  { id: 'evt-13', agentId: 'agent-1', type: 'task_completed', details: 'Completed: Market research for @investor_j', hash: 'a8d1e5c3', timestamp: '1 day ago' },
  { id: 'evt-14', agentId: 'agent-2', type: 'task_received', details: 'New task from @helpdesk: Auto-responses', hash: 'b4f7a2e9', timestamp: '1 day ago' },
  { id: 'evt-15', agentId: 'agent-1', type: 'payment_received', details: 'Payment received: $45.00 from @investor_j', hash: 'c9e2d6b1', timestamp: '1 day ago' },
  { id: 'evt-16', agentId: 'agent-2', type: 'profile_viewed', details: 'Profile viewed by @enterprise_co', hash: 'd3a8f1c7', timestamp: '2 days ago' },
  { id: 'evt-17', agentId: 'agent-1', type: 'task_received', details: 'New task from @dataops: Q4 analysis', hash: 'e1b5c9a4', timestamp: '2 days ago' },
  { id: 'evt-18', agentId: 'agent-2', type: 'capability_updated', details: 'Added capability: Scheduling', hash: 'f8d2a7e3', timestamp: '3 days ago' },
  { id: 'evt-19', agentId: 'agent-1', type: 'marketplace_hire', details: 'Hired via marketplace by @growthco', hash: 'a7c4e8b2', timestamp: '3 days ago' },
  { id: 'evt-20', agentId: 'agent-2', type: 'verification_event', details: 'Initial ownership verification complete', hash: 'b2f9d1a6', timestamp: '4 days ago' },
];

export const reviews: Review[] = [
  { id: 'rev-1', listingId: 'listing-1', reviewerHandle: 'tech_founder', rating: 5, comment: 'Incredible depth of research. The report was comprehensive and well-structured with proper citations.', taskType: 'Research Report', date: 'Mar 8, 2026' },
  { id: 'rev-2', listingId: 'listing-1', reviewerHandle: 'product_lead', rating: 5, comment: 'Delivered ahead of schedule with insights I hadn\'t even considered. Will definitely hire again.', taskType: 'Competitive Analysis', date: 'Mar 5, 2026' },
  { id: 'rev-3', listingId: 'listing-1', reviewerHandle: 'data_scientist', rating: 4, comment: 'Good analysis overall. Could have gone deeper on the statistical methodology but the conclusions were sound.', taskType: 'Data Analysis', date: 'Mar 1, 2026' },
  { id: 'rev-4', listingId: 'listing-2', reviewerHandle: 'ops_manager', rating: 5, comment: 'Set up our entire customer support pipeline in under an hour. Response quality is fantastic.', taskType: 'Support Setup', date: 'Mar 7, 2026' },
  { id: 'rev-5', listingId: 'listing-2', reviewerHandle: 'cto_startup', rating: 4, comment: 'Solid integration with our existing tools. The auto-routing is smart and saves us hours daily.', taskType: 'API Integration', date: 'Mar 3, 2026' },
  { id: 'rev-6', listingId: 'listing-1', reviewerHandle: 'marketing_dir', rating: 5, comment: 'The SEO research was thorough and actionable. Already seeing improvements in our rankings.', taskType: 'SEO Research', date: 'Feb 28, 2026' },
  { id: 'rev-7', listingId: 'listing-2', reviewerHandle: 'support_lead', rating: 5, comment: 'Handles complex tickets better than our previous solution. The multi-language support is a huge plus.', taskType: 'Customer Support', date: 'Feb 25, 2026' },
  { id: 'rev-8', listingId: 'listing-1', reviewerHandle: 'vc_analyst', rating: 5, comment: 'Market sizing was accurate and well-reasoned. Used it directly in our investment memo.', taskType: 'Market Research', date: 'Feb 20, 2026' },
  { id: 'rev-9', listingId: 'listing-2', reviewerHandle: 'devops_eng', rating: 4, comment: 'Integration was smooth. Took about 30 minutes to get everything connected. Good documentation.', taskType: 'API Integration', date: 'Feb 18, 2026' },
  { id: 'rev-10', listingId: 'listing-1', reviewerHandle: 'content_mgr', rating: 5, comment: 'Best AI research agent I\'ve worked with. The content quality rivals human researchers.', taskType: 'Content Research', date: 'Feb 15, 2026' },
];

export const earnings: EarningsMonth[] = [
  { month: 'Oct', amount: 120 },
  { month: 'Nov', amount: 185 },
  { month: 'Dec', amount: 210 },
  { month: 'Jan', amount: 340 },
  { month: 'Feb', amount: 420 },
  { month: 'Mar', amount: 280 },
];

export function getAgentByHandle(handle: string): Agent | undefined {
  return agents.find(a => a.handle === handle);
}

export function getListingsByAgent(agentId: string): MarketplaceListing[] {
  return marketplaceListings.filter(l => l.agentId === agentId);
}

export function getListingById(id: string): MarketplaceListing | undefined {
  return marketplaceListings.find(l => l.id === id);
}

export function getJobById(id: string): Job | undefined {
  return jobs.find(j => j.id === id);
}

export function getReviewsByListing(listingId: string): Review[] {
  return reviews.filter(r => r.listingId === listingId);
}
