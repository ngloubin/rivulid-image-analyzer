export function ignoreShortcut(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey">) {
  return event.ctrlKey || event.metaKey || event.altKey;
}
