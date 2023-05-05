import { config } from "dotenv";

config();

import { HoneycombSDK } from "@honeycombio/opentelemetry-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

// uses the HONEYCOMB_API_KEY and OTEL_SERVICE_NAME environment variables
export const sdk = new HoneycombSDK({
    instrumentations: [
        getNodeAutoInstrumentations({
            // we recommend disabling fs autoinstrumentation since it can be noisy
            // and expensive during startup
            '@opentelemetry/instrumentation-fs': {
                enabled: false,
            },
        }),
    ],
});

sdk.start();

export async function shutdown() {
    return sdk.shutdown()
}