import { createApp } from "./app.js";
import { config } from "./config.js";
const { app } = await createApp();
await app.listen({ host: "127.0.0.1", port: config.port });
console.log(`Darkroom Studio 2027 · http://127.0.0.1:${config.port}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
