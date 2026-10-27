# Security Policy

## Supported Versions

The latest release is the supported version for security fixes. If there has not yet been a release, report issues against the latest development version. Fixes for older releases may be considered at the maintainers' discretion.

## Reporting a Vulnerability

Please do not report vulnerabilities in public issues, pull requests, or discussions.

Report vulnerabilities privately through GitHub's [Security Advisories](https://github.com/rathinosk/TaskRunner/security/advisories/new) feature. Open the repository's **Security** tab and choose **Report a vulnerability**. The report is visible only to the repository maintainers, and the discussion, fix, and any CVE coordination can be handled privately.

Include the affected version or commit, the relevant file or operation, steps to reproduce the issue, and the potential impact. Attach a minimal sample `taskrunner.json` only if it is safe and appropriate to do so.

Task Runner is a VS Code extension that runs tasks and shell commands from buttons defined in `.vscode/taskrunner.json`, and it loads icons from workspace files into a webview. Relevant reports may include a workspace configuration that runs a command without the user clicking its button or without the `confirm` prompt; behavior that bypasses the limited support for untrusted workspaces; icon paths that read files outside the workspace; script injection or a content security policy bypass in the webview; and unsafe edits to the configuration file.

The maintainers will acknowledge reports and provide updates as they investigate and work on a fix. Once a fix is released, the security advisory can be published, and reporters will be credited if they wish.
