import * as path from 'path';
import Mocha from 'mocha';
import { readdirSync } from 'fs';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true });
  for (const f of readdirSync(__dirname)) {
    if (f.endsWith('.test.js')) mocha.addFile(path.join(__dirname, f));
  }
  return new Promise((resolve, reject) => {
    mocha.run((failures) => (failures ? reject(new Error(`${failures} tests failed`)) : resolve()));
  });
}
