# Milestone 3 features

This milestone defines the product behavior and boundaries without prescribing detailed implementation or visual design. The UI should stay within these decisions while leaving room to experiment with layout, styling, and interaction details.

- [x] **Manual transcript compaction**
  - `/compact` command with optional instructions
  - Compacting indicator attached directly to the composer
  - Compact, borderless, square-bottom styling with no spacing
  - Composer sending disabled while compacting
  - Sending enabled again when compaction is aborted
  - Abort support
  - Collapsible compaction summary
  - Error and retry states
  - No pulsing dots or status dots

- **Context and cost indicators**
  - Positioned at the bottom-right of the main panel
  - Very compact display with no text labels
  - Context usage and token count
  - Estimated session cost
  - Live updates while streaming
  - Icons or compact visual indicators instead of dots

- [x] **Inspectable tool activity**
  - Clear tool names, arguments, status, and duration
  - Collapsible tool details
  - Animated expand and collapse behavior matching the rest of the app
  - Compact details with minimal actions
  - Copy arguments and output
  - Scrollable tool output
  - Error highlighting
  - Add file paths directly to the composer
  - No pulsing dots or status dots

- **Improved auto-scrolling**
  - Scroll only when already at the bottom
  - Preserve the user’s position while reading history
  - “Scroll to bottom” button
  - Unread message count while scrolled away
  - No pulsing dots or status dots

- **Full-text search**
  - Normal cmdk command palette matching the existing session search
  - Search within the current session
  - Search all sessions using `:` in the palette
  - Search only user and AI messages
  - Exclude reasoning and tool calls
  - Search result snippets and highlighting
  - Keyboard shortcuts for opening and navigating search
  - Jump to matching messages

- **Completion notifications**
  - Toasts when background sessions finish
  - Session name and response preview
  - Open or dismiss actions
  - Stacking and auto-dismiss behavior
  - Icons or shimmer text instead of pulsing dots

- **Queuing and steering**
  - Replace the normal streaming stop button with a queue-message button
  - Add an interrupt button beside it for forcefully sending a message
  - Queue messages while the agent is streaming
  - Send queued messages as follow-ups
  - Interrupt and send a message immediately when requested
  - Edit, discard, or change queue behavior
  - Up to two queued messages
  - Queue persistence per session
  - Automatic sequential draining after the agent finishes
  - Queue indicator attached directly to the composer
  - Compact, borderless, square-bottom styling with no spacing
  - No pulsing dots or status dots

- **New Chat home screen**
  - Vertical list of small, ghost-style starter prompts
  - Starter prompts fill the composer without sending
  - Improved empty-session messaging
  - No “Build, Fix and Ship” heading
  - No keyboard shortcut guide

- **Supporting UI improvements**
  - Animated expand and collapse interactions
  - Reduced-motion support
  - Keyboard and screen-reader accessibility
  - Responsive layouts for narrow screens
  - No pulsing dots anywhere
  - No status dots anywhere
  - Use icons or human-looking indicators such as shimmer text when an indicator is needed

## Verification

- Confirm every feature above is implemented without adding behavior outside this scope.
- Confirm the UI has no pulsing dots or status dots.
- Confirm compaction disables composer sending and that abort restores it.
- Confirm queue-message and interrupt controls replace the normal streaming stop control.
- Confirm queued and compaction indicators attach directly to the composer with no bottom border, border radius, or spacing.
- Confirm context and cost indicators appear in the bottom-right of the main panel and remain compact and unlabeled.
- Confirm tool details are compact, collapsible, and animated without unnecessary actions.
- Confirm search uses the existing cmdk-style session palette and excludes reasoning and tool calls.
- Confirm the home screen uses only the vertical ghost-style starter prompts and has no shortcut guide or “Build, Fix and Ship” heading.
- Confirm keyboard access, reduced-motion behavior, responsive layouts, and readable error states.
