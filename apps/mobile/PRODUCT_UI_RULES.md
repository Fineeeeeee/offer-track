# OfferJing Product UI Rules

These rules apply to every visible feature and screen change in the mobile app.

## 1. Start From The User Task

Before implementation, define:

- the user situation;
- the single result the user wants;
- expected usage frequency;
- where progress is saved and how failure resumes.

Do not add UI until the feature has a clear home in an existing task flow.

## 2. Place Features By Frequency

- Core and frequent actions belong in the primary screen flow.
- Common secondary actions use an action row that opens a detail screen.
- Infrequent actions belong in a sheet, overflow menu, or Settings.
- Background work uses a compact non-blocking task row.
- AI features have one entry point and render the result in place.

## 3. Use Four Visual Layers

Every screen uses no more than these layers:

1. `ScreenScaffold`: safe area, navigation, scrolling.
2. `Section`: a title and related content; normally no card background.
3. `ActionRow`: one readable or tappable item with an optional trailing value.
4. `FeatureCard`: reserved for the next interview, recording, AI generation, or an actionable empty state.

Cards must not contain other cards. A screen may show only one primary action and one segmented control at a time.

## 4. Reuse Semantic Components

- Do not introduce page-local colors, radii, shadows, or spacing when a token exists.
- Add a component only when it has a distinct behavior or is reused.
- Use status tags for state, not full-width state panels.
- Use sheets for filters and compact choices.
- Use a detail screen for long reading or multi-section editing.
- Keep display and edit modes separate.

## 5. Design Every State

Each feature must handle normal, empty, loading, failed, partial, background, and restored states. OCR, transcription, and AI work must persist progress and never rely on a blocking spinner as the only feedback.

## 6. Responsive And Accessibility Gate

Verify every changed screen at 360, 393, and 412 dp widths with font scales 1.0 and 1.2. Test empty, normal, and long content. Text containers use flexible height, wrapping, and shrinking; fixed heights are limited to stable icon or control targets.

## 7. Completion Gate

A UI change is complete only when:

- back, cancel, blank-area dismissal, and repeated taps behave correctly;
- app restart restores saved progress;
- existing recording, transcription, OCR, and review flows still work;
- typecheck and relevant tests pass;
- Android device screenshots show no clipping, overlap, or unreachable actions.

## 8. Long Content And Navigation Performance

- A view switch must not run a layout animation across an entire long document.
- Derived transcript data is memoized and recalculated only when its source changes.
- Collapsed long content is created lazily; hidden raw text must not build hundreds of nodes.
- The default view shows the decision and the next useful action. Scores, evidence, editing,
  export, deletion, and raw data stay behind a clear disclosure or overflow action.
- Do not show the same audio metadata, review conclusion, or status control in multiple visible
  containers on one screen.
