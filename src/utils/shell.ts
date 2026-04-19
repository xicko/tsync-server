/* eslint-disable prettier/prettier */
import ChildProcess from 'child_process';

export function runCommandSpawn(command: string, args: string[] = []) {
  return new Promise<string>((resolve, reject) => {
    // Disable shell: true to prevent command injection via operators like ;, &&, etc.
    const child = ChildProcess.spawn(
      command,
      [...args],
      { shell: false },
    );
    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve(output);
      } else {
        resolve(output);
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
