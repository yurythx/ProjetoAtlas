# CRM Gap Analysis Toward Monday.com

## Current Strengths

- Dynamic board model based on `Pipeline -> Column -> Deal`
- Public CRM contract centered on `column`, with legacy `stage` already isolated
- Kanban, table and side panel already share the same card editing flow
- Inline updates for title, owner, deadline, priority, progress and column
- Pipeline overview with backend summary and column metrics
- Deal history, notifications, calendar sync and inbound/outbound integration hooks
- Explicit column semantics in backend and frontend:
  - `column_kind`
  - `marks_done`
  - `requires_schedule`
  - `requires_assignee`

## Main Gaps vs Monday.com

### P0 - Operational Consistency

1. Saved views per pipeline
- Missing persisted combinations of filters, sort, visible columns and default tab.
- This is one of the biggest daily productivity wins in Monday-like products.

2. Strong column types beyond visual state
- The project already has semantic columns, but the product still lacks richer typed fields for board customization:
  - status
  - date
  - people
  - number
  - formula
  - tags
  - relation

3. Board governance and transition rules
- There is still no first-class concept for:
  - allowed transitions
  - WIP limits
  - required fields per transition
  - SLA policy by column

4. True work updates and collaboration thread
- The side panel has a strong update area, but it is still centered on the card description.
- Monday-like execution usually depends on structured updates, mentions, replies and activity feed filters.

### P1 - Manager Visibility

1. Multiple views over the same board
- Current product has Kanban, table and overview.
- Missing high-value views:
  - calendar
  - timeline
  - workload
  - my work

2. Dashboard widgets and drill-down analytics
- Overview is useful, but still narrow.
- Missing:
  - conversion and throughput widgets
  - lead time / cycle time
  - aging by column
  - owner performance
  - SLA breach forecast

3. Automations as product feature
- Backend already has hooks and activity types for automation.
- Missing a user-facing rule builder such as:
  - when card enters column X
  - when deadline is near
  - when owner changes
  - then notify / assign / schedule / call webhook

### P2 - Scale and Adoption

1. Templates and onboarding kits
- Missing pipeline templates for common CRM and service desk flows.

2. Subitems / checklist execution model
- Progress exists, but there is no native execution breakdown inside the card.

3. Cross-board relationships
- Missing relation between deals, projects, tickets, finance items or contacts as first-class linked records.

4. Enterprise controls
- Missing audit-oriented controls such as granular field permissions, automation scopes and approval flows.

## Recommended Roadmap

### Phase 1 - Board Operating System

1. Saved views
- Persist filters, sorting, visible columns and default view per user and pipeline.

2. Column transition policies
- Add allowed transitions, WIP limit and required fields per column.

3. Structured updates
- Split card description from operational updates thread.
- Add mentions, pinned updates and quick activity filters.

### Phase 2 - Execution Views

1. Calendar view
- Reuse `closing_date` and `data_agendamento`.

2. Timeline view
- Add start date and duration support when needed.

3. Workload view
- Aggregate cards by owner and technician, highlighting overload and SLA risk.

### Phase 3 - Automation and Intelligence

1. User-facing automation builder
2. SLA engine per pipeline/column
3. Aging and throughput analytics
4. Suggested next actions based on risk and stalled cards

## Recommended Next Implementation

The highest-value next increment is:

1. Saved views for Kanban/Table/Overview
2. Transition policies on columns
3. Structured card updates with mentions

This sequence keeps the current CRM architecture, improves daily usability quickly, and moves the product closer to the operational depth expected from Monday.com.
