# Contributing to Task Runner

Thank you for your interest in contributing to Task Runner!

Everything happens on GitHub, in the [TaskRunner repository](https://github.com/rathinosk/TaskRunner). Use GitHub issues for questions, bug reports and feature discussions, and pull requests for proposed changes so that project work stays in one place.

## Contents

* [Ask for help](#ask-for-help)
* [Report a bug](#report-a-bug)
* [Suggest a feature](#suggest-a-feature)
* [Build and test](#build-and-test)
* [Contribute code](#contribute-code)
* [Contribute documentation](#contribute-documentation)
* [Licence](#licence)

## Ask for help

Open an [issue](https://github.com/rathinosk/TaskRunner/issues) and describe what you are trying to do. For usage guidance, start with the [README](README.md).

## Report a bug

Open an [issue](https://github.com/rathinosk/TaskRunner/issues). A useful report includes:

* what you expected and what happened instead;
* the Task Runner version or commit, VS Code version, and operating system;
* the steps that reproduce the problem;
* the relevant part of your `.vscode/taskrunner.json`, with anything private removed.

For rendering or UI issues, include a screenshot if practical. For a security vulnerability, follow [SECURITY.md](SECURITY.md) instead of reporting it publicly.

## Suggest a feature

Open an [issue](https://github.com/rathinosk/TaskRunner/issues) and describe the problem you want solved before proposing a solution. For larger changes, discuss the approach before investing in implementation.

## Build and test

Task Runner needs Node.js and npm.

```powershell
npm install
npm run build
npm test
```

`npm test` runs the type checks, the unit tests and the host tests. The host tests download and start a VS Code instance, so they need a desktop environment. `npm run test:unit` runs the unit tests alone. See the [README](README.md#development) for the other scripts and for debugging the extension in a development host.

## Contribute code

Open a pull request against the [TaskRunner repository](https://github.com/rathinosk/TaskRunner). For anything larger than a small fix, open an issue first so the approach and scope can be agreed before implementation.

### Guidelines

* Keep the source split as it is: `src/core` is pure logic with no `vscode` dependency, `src/host` is the extension host, and `src/webview` is the grid UI. Logic should be testable without a VS Code instance where practical.
* Keep the configuration file safe to edit by hand. Edits made by the extension must keep the user's comments and formatting, and must not discard buttons or properties it does not understand.
* Respect workspace trust. In an untrusted workspace nothing may run, and workspace files such as icons must not be loaded.
* Treat `.vscode/taskrunner.json` as untrusted input. Validate it, and do not build commands, paths or markup from it without checking them.
* Add or update tests for behavior changes. Follow the existing test organization and patterns.
* Keep the type checks passing, and match surrounding style and comment density.
* Keep the JSON schema in `schemas/` and the README in step with any change to the configuration.
* Do not add outside code, packages, tools, or source without agreement in an issue first, and list any third-party material in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
* Do not add icons, images, or other assets that you do not have the right to share under the project's terms.

## Contribute documentation

User documentation lives in the [README](README.md). Submit documentation changes through a pull request, as with code. Corrections, examples, and missing explanations are welcome.

## Licence

Task Runner is licensed under the MIT licence (see [LICENSE](LICENSE)). By contributing, you agree that your contribution is licensed under the same terms.
