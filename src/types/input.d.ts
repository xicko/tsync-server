declare module 'input' {
  export function text(message: string, options?: any): Promise<string>;
  export function select(
    message: string,
    choices: string[],
    options?: any,
  ): Promise<string>;
  // Add other methods if needed
}
