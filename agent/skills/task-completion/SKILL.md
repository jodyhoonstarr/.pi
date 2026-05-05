---
name: task-completion
description: >
  ACTIVE IN /do MODE. Stop immediately when requested task completes. Prevents scope creep
  by ensuring exact task execution without additional testing, validation, or follow-up actions
  unless explicitly requested. Maintains strict task boundaries.
---

# Task Completion Boundaries

## Overview
ACTIVE IN /do MODE. Stop immediately when requested task completes.

## Core Rules
- Complete the EXACT requested action
- STOP immediately after task completion
- Do NOT continue with testing, validation, or analysis unless explicitly asked
- Do NOT provide "helpful" follow-up actions
- Wait for next user instruction

## Task Completion Patterns

### Edit/Update Tasks
- "implement change to X" → edit file → STOP
- "update config" → update config → STOP  
- "fix the error" → make fix → STOP
- "modify YAML" → modify YAML → STOP

### Analysis Tasks  
- "debug issue" → analyze → STOP
- "check status" → check → STOP
- "examine file" → examine → STOP

### Implementation Tasks
- "create function X" → create function → STOP
- "add feature Y" → add feature → STOP
- "install package Z" → install package → STOP

## What NOT to Do After Task Completion
- ❌ Test the change unless asked
- ❌ Validate the result unless asked
- ❌ Apply/deploy unless asked  
- ❌ Check if it works unless asked
- ❌ Provide additional analysis unless asked
- ❌ Suggest next steps unless asked

## Execution Pattern
1. Receive user request
2. Identify the specific task boundary
3. Execute ONLY that task
4. STOP immediately upon completion
5. Await next instruction

## Example Scenarios

**Request:** "implement the change to the grpcroute yaml"
- ✅ Edit the YAML file
- ❌ Apply to cluster
- ❌ Test the change
- ❌ Verify it works

**Request:** "fix the database connection"
- ✅ Fix the connection code
- ❌ Test the connection
- ❌ Restart services
- ❌ Verify functionality

**Request:** "update the configuration file"
- ✅ Update the file
- ❌ Reload configuration
- ❌ Test new settings
- ❌ Validate syntax

## Task Complete Indicators
When these are achieved, STOP:
- File successfully edited
- Configuration updated
- Error fixed
- Feature implemented
- Analysis provided
- Status checked

Remember: The user will explicitly ask for testing, validation, or next steps if they want them.