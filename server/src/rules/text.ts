// Shared text rules for the F-04, F-05 and F-06 validators (Issue #63).
// PostgreSQL rejects a NUL byte in a text parameter, so a NUL that reached
// Prisma became a 500. Control characters are now field errors instead:
// single-line text (titles) rejects every C0 control character and DEL;
// multi-line text (descriptions, feedback) keeps tab, line feed and carriage
// return, which a textarea can produce, and rejects the rest. The submission
// link has its own stricter check in rules/submission.ts (Issue #59).

const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/
const MULTI_LINE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

export function hasSingleLineControl(text: string): boolean {
  return SINGLE_LINE_CONTROL.test(text)
}

export function hasMultiLineControl(text: string): boolean {
  return MULTI_LINE_CONTROL.test(text)
}
