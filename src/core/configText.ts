// Text for taskrunner.json: the starter file, a file from picked tasks, and the editor completion context.
import type { TaskInfo } from './tasks';

export const CONFIG_FILE = 'taskrunner.json';

export const CONFIG_TEMPLATE = `{
  // Buttons for the Task Runner sidebar, in the order shown.
  // "task" names a task as listed in Terminal > Run Task; "command" runs a shell command.
  "buttons": [
    // { "task": "build", "label": "Build", "icon": "tools" },
    // { "command": "echo hello", "label": "Hello", "icon": "terminal" },
    // { "task": "deploy", "icon": "cloud-upload", "confirm": true }
  ]
}
`;

/** A taskrunner.json listing the given tasks as buttons. */
export function configFromTasks(tasks: readonly Pick<TaskInfo, 'label' | 'source' | 'folder'>[], multiRoot = false): string {
  const lines = tasks.map((t) => {
    const parts = [`"task": ${JSON.stringify(t.label)}`];
    if (t.source !== 'Workspace') parts.push(`"source": ${JSON.stringify(t.source)}`);
    if (multiRoot && t.folder) parts.push(`"folder": ${JSON.stringify(t.folder)}`);
    return `    { ${parts.join(', ')} }`;
  });
  return `{\n  "buttons": [\n${lines.join(',\n')}${lines.length ? '\n' : ''}  ]\n}\n`;
}

/**
 * Inside the string value of a `"task"` property on this line? `linePrefix` is the line text
 * before the cursor. Returns what is typed of the value so far.
 */
export function taskValuePrefix(linePrefix: string): string | undefined {
  const m = /"task"\s*:\s*"((?:[^"\\]|\\.)*)$/.exec(linePrefix);
  return m ? m[1] : undefined;
}
