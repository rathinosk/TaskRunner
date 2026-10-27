import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  // Set when launched from a VS Code terminal; makes Code.exe behave as plain Node.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
  const extensionTestsPath = path.resolve(__dirname, 'suite/index');
  const workspace = path.resolve(extensionDevelopmentPath, 'test/fixtures/workspace');
  await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs: [workspace] });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
