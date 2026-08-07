import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const { app } = await buildApp(config);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(
    { port: config.port, version: config.appVersion },
    "server started",
  );
} catch (reason) {
  app.log.fatal(
    {
      errorName: reason instanceof Error ? reason.name : "UnknownError",
      stack: reason instanceof Error ? reason.stack : undefined,
    },
    "server startup failed",
  );
  process.exitCode = 1;
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, "server stopping");
    const forcedExit = setTimeout(() => process.exit(1), 10_000);
    forcedExit.unref();
    void app
      .close()
      .catch((reason: unknown) => {
        app.log.error(
          { errorName: reason instanceof Error ? reason.name : "UnknownError" },
          "server shutdown failed",
        );
        process.exitCode = 1;
      })
      .finally(() => clearTimeout(forcedExit));
  });
}
