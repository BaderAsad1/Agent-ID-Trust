# Agent Mail — Manual QA Checklist

## Prerequisites
- [ ] Seed data loaded (`pnpm --filter @workspace/scripts run seed`)
- [ ] API server running on port 8080
- [ ] Frontend accessible at /dashboard/mail
- [ ] At least 2 agents registered under a user account

## Inbox Views

### Agent Selector
- [ ] All user's agents displayed with handles and identicons
- [ ] Selecting an agent switches inbox context and reloads data
- [ ] Stats cards (Total Messages, Unread, Threads, Open Threads) update per agent

### Thread List
- [ ] Threads displayed with subject, message count, status badge, and timestamp
- [ ] Unread threads have blue highlight and unread count badge
- [ ] Clicking a thread navigates to thread detail
- [ ] Empty inbox shows empty state with compose CTA

### Thread Detail
- [ ] Thread header shows subject, message count, status, and unread count
- [ ] All messages in thread listed chronologically
- [ ] Back button returns to thread list
- [ ] Each message shows sender info, direction arrow, and time

### Message Detail
- [ ] Full message body rendered (plaintext and HTML modes)
- [ ] Sender address, direction arrow, sender type badge visible
- [ ] Trust badge shown (verified shield or trust score)
- [ ] Priority badge shown for high/urgent messages
- [ ] Recipient address displayed
- [ ] Labels displayed as colored chips
- [ ] Attachments listed with filename and size
- [ ] Converted task reference shown if applicable
- [ ] Structured payload inspector expandable with JSON view
- [ ] Provenance chain timeline rendered with actors and timestamps

## Actions

### Message Actions
- [ ] Archive button archives message and refreshes view
- [ ] Convert to Task button creates linked task (button hidden after conversion)
- [ ] Route button triggers routing rule re-evaluation
- [ ] Approve button visible for inbound messages
- [ ] Reject button visible for inbound messages
- [ ] All action buttons show loading spinner during operation

### Read/Unread
- [ ] Eye icon toggles read/unread state on messages
- [ ] Read timestamp (readAt) set when marking read
- [ ] Unread indicator (blue dot) appears/disappears correctly
- [ ] Mark thread read marks all messages in thread

### Reply
- [ ] Reply textarea visible in message detail
- [ ] Send Reply button sends reply within thread context
- [ ] Reply appears in thread after sending
- [ ] Thread message count increments after reply

### Compose
- [ ] Compose button opens modal
- [ ] Recipient selection buttons for known agents
- [ ] Manual recipient address input
- [ ] Subject and body fields
- [ ] Send creates new message and thread
- [ ] Modal closes and inbox refreshes after send
- [ ] Error state shown on failure

## Labels & Filtering

### Label Display
- [ ] System labels shown as colored chips on messages
- [ ] Custom labels shown with custom colors
- [ ] 18 system labels present (inbox, sent, archived, spam, important, tasks, drafts, flagged, verified, quarantine, unread, routed, requires-approval, paid, marketplace, jobs, agent, human)

### Label Filtering
- [ ] Filter toggle button shows/hides label filter bar
- [ ] "All" filter selected by default
- [ ] Clicking a label filters threads by that label
- [ ] Active label highlighted
- [ ] Clicking active label deselects (returns to All)

## Search
- [ ] Search bar accepts text input
- [ ] Enter key triggers search
- [ ] Results displayed as message list with badges
- [ ] Clear button (X) resets search and returns to thread list
- [ ] Search results show result count
- [ ] Empty results show empty state

## Message Events
- [ ] Events button in message detail toggles event panel
- [ ] Events listed with type and timestamp
- [ ] Events include: message.received, message.sent, label.assigned, etc.

## Loading & Error States
- [ ] Skeleton loaders shown during initial data load
- [ ] Error state with retry button on API failure
- [ ] No agents registered shows empty state

## Webhooks (API-level)
- [ ] List webhooks returns seeded webhook entries
- [ ] Create webhook with public URL succeeds
- [ ] Create webhook with private/localhost URL rejected (400)
- [ ] Delete webhook removes it
- [ ] Webhook secrets encrypted (secretEncrypted column, not plaintext)

## Access Control
- [ ] Cannot access other user's agent inbox (403)
- [ ] Label operations verify message ownership
- [ ] Webhook operations scoped to owning agent

## Integration Tests
- [ ] All tests in `mail.test.ts` pass
- [ ] E2E test covers: inbox create → send → thread → label → route → convert task → verify history
