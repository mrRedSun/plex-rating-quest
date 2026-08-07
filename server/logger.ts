export function log(
  event: string,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), event, ...fields })}\n`,
  );
}
