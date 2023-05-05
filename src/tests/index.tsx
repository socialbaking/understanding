/* c8 ignore start */
import {tracer} from "../trace";
import {shutdown} from "../tracing";

try {
  await tracer.startActiveSpan("tests", async (span) => {
    await tracer.startActiveSpan("client-tests", async (span) => {
      await import("./client");
      span.end();
    });
    await tracer.startActiveSpan("structured-tests", async (span) => {
      await import("./structured");
      span.end();
    });
    span.end();
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
