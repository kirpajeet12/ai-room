const OSC = /\x1b\][\s\S]*?(?:\x07|\x1b\\|$)/g;
const DCS_PM_APC_SOS = /\x1b[PX^_][\s\S]*?(?:\x1b\\|$)/g;
const CSI = /(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]?/g;
const OTHER_ESCAPE = /\x1b[\s\S]?/g;
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

// Strip terminal control sequences from text we did not write (AI replies,
// CLI error output) so it cannot touch the clipboard, retitle the window,
// move the cursor or hide text. Newlines and tabs are kept.
export function stripControl(text) {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(OSC, "")
    .replace(DCS_PM_APC_SOS, "")
    .replace(CSI, "")
    .replace(OTHER_ESCAPE, "")
    .replace(CONTROL, "");
}
