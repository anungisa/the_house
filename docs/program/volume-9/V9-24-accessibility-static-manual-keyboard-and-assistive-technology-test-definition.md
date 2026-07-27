# Volume 9 — Accessibility Static, Manual, Keyboard, and Assistive-Technology Test Definition

Document ID: V9-24
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G3)

## Purpose

This chapter defines the accessibility assurance obligations across automated static
analysis, manual inspection, keyboard operation, and assistive-technology
interaction. It defines what must be tested, not how any test is written or run, and
authorizes no execution, evaluation, environment, or tool.

## Automated static analysis is incomplete

Automated static accessibility analysis is held strictly distinct from manual
inspection, keyboard completion, and assistive-technology evidence. An automated
scan reports governed semantic and structural findings but is never treated as a
conformance determination. An automated pass treated as full accessibility
conformance is detected and rejected.

## Keyboard and manual obligations

Every governed task is completable by keyboard, with correct focus order and focus
management, under zoom and reflow. Manual inspection covers semantic structure, the
visible focus indicator, and error identification. The governed task inventory spans
primary tasks, exception tasks, staff tasks, and the tasks required during an
interruption, a degraded condition, and a recovery. A task that cannot be completed
by keyboard, or that loses focus, is detected and rejected.

## Assistive technology

Screen-reader interaction, status announcements, and error recovery carry governed
assistive-technology obligations. Status changes, errors, and the steps of a
recovery are perceivable and operable through assistive technology with governed
announcements. A silent status change or an unannounced error under assistive
technology is detected and rejected.

## Boundary

No accessibility obligation in this chapter asserts a conformance result. Each is a
documentary obligation only, and the manual, keyboard, and assistive-technology
evidence that a future evaluation would require is not created, provisioned, or
executed by this package.
