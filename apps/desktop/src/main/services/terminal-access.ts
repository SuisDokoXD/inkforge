export function assertTerminalDevModeEnabled(devModeEnabled: boolean): void {
  if (!devModeEnabled) {
    throw new Error("terminal is available only when developer mode is enabled");
  }
}
