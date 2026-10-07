import { SuperJSON } from "superjson";

// Configure a shared SuperJSON instance with BigInt support so tRPC client/server both
// serialize BigInt PlayerIDs transparently as strings on the wire.
SuperJSON.registerCustom<bigint, string>(
  {
    isApplicable: (v): v is bigint => typeof v === "bigint",
    serialize: (v) => v.toString(),
    deserialize: (v) => BigInt(v),
  },
  "bigint",
);

export const superjson = SuperJSON;
export default superjson;
