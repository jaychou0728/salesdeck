const INTERNAL_PAREN =
  /[（(]\s*(?:scope|dryRun|toolName|tool_calls|confirmationToken|idempotencyKey|status)\b[^）)]*[）)]/gi;
const INTERNAL_ASSIGN =
  /\b(?:scope|dryRun|toolName|confirmationToken|idempotencyKey)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s，。；,;）)]+)/gi;
const CLICK_POSITIONAL = /点击[上下]面(?:的)?(?:可执行)?选项/g;
const POSITIONAL = /从?[上下]面(?:的)?选项/g;

export function sanitizeAssistantText(text: string) {
  let result = text;
  result = result.replace(INTERNAL_PAREN, "");
  result = result.replace(INTERNAL_ASSIGN, "");
  result = result.replace(CLICK_POSITIONAL, "点击可执行选项");
  result = result.replace(POSITIONAL, "可执行选项");
  result = result.replace(/从可执行选项里/g, "从可执行选项中");
  result = result.replace(/[（(]\s*[）)]/g, "");
  result = result.replace(/[ \t]{2,}/g, " ");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}
