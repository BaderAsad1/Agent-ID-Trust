// Root export is the zod schema namespace (runtime values).
// Type-only consumers should import from "@workspace/api-zod/types"
// (see the "./types" subpath in package.json) to avoid the
// schema-vs-type name collisions that orval's split-types output produces.
export * from "./generated/api";
