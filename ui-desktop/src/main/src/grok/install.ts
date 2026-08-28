// ============================================================================
// Installing grok, using the method grok itself documents.
//
// From its own docs (~/.grok/docs/user-guide/01-getting-started.md, and x.ai):
//
//     curl -fsSL https://x.ai/cli/install.sh | bash
//
// NOT `brew install grok`. That name on Homebrew belongs to a completely
// different program — jordansissel's regex tool — and installing it would leave
// the user with a working `grok` binary that has nothing to do with xAI, which
// is a far more confusing outcome than a failed install.
//
// This pipes a remote script into a shell, which is worth being uncomfortable
// about; it is also exactly what the vendor documents, and inventing a
// different mechanism would mean shipping our own idea of how to install
// someone else's tool. The mitigation is honesty rather than cleverness: the
// exact command is shown in the UI before anything runs, nothing happens until
// the user clicks, and the installer's own output is surfaced verbatim.
// ============================================================================

export type InstallCommand = {
  /** Shown to the user BEFORE anything runs. */
  display: string;
  file: string;
  args: string[];
};

export function grokInstallCommand(): InstallCommand {
  const command = 'curl -fsSL https://x.ai/cli/install.sh | bash';
  return {
    display: command,
    file: '/bin/bash',
    // -l so the login shell's PATH is in place: the installer puts grok in
    // ~/.grok/bin and expects a normal environment, and a GUI app inherits
    // almost nothing.
    args: ['-lc', command],
  };
}
