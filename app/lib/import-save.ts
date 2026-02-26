export const SAVE_STOP_REQUESTED = "__SAVE_STOP_REQUESTED__";
export const SAVE_STOPPED_BY_USER_PREFIX = "Save stopped by user";

export function isSaveStoppedMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    message === SAVE_STOP_REQUESTED ||
    message.startsWith(SAVE_STOPPED_BY_USER_PREFIX)
  );
}
