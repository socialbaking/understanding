/* c8 ignore start */
import {tracer} from "../trace";
import {shutdown} from "../tracing";

try {
  await tracer.startActiveSpan("tests", async () => {
    await tracer.startActiveSpan("client-tests", async () => {
      await import("./client");
    });
    await tracer.startActiveSpan("structured-tests", async () => {
      await import("./structured");
    });
  })
  console.log("Tests successful");
} catch (error) {
  console.error(error);
  if (typeof process !== "undefined") {
    process.exit(1);
  }
  throw error;
}

await shutdown();

export default 1;
