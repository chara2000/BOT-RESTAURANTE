export class WhatsAppPolicyService {
  private static readonly WINDOW_24H_MS = 24 * 60 * 60 * 1000;

  /**
   * Checks whether the WhatsApp 24-hour service window is open
   */
  public static isWindowOpen(lastUserActivityTimestamp?: number): boolean {
    if (!lastUserActivityTimestamp) return true; // Treat as open during current webhook interaction
    const now = Date.now();
    return (now - lastUserActivityTimestamp) <= this.WINDOW_24H_MS;
  }

  /**
   * Determines message delivery policy
   */
  public static evaluatePolicy(lastUserActivityTimestamp?: number): {
    windowOpen: boolean;
    templateRequired: boolean;
    mode: 'freeform' | 'template';
  } {
    const windowOpen = this.isWindowOpen(lastUserActivityTimestamp);
    return {
      windowOpen,
      templateRequired: !windowOpen,
      mode: windowOpen ? 'freeform' : 'template',
    };
  }
}
