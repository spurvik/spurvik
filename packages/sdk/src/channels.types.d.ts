import type { buildChannelOutboundRequest } from "./channels.js";
type Outbound = ReturnType<typeof buildChannelOutboundRequest>;
type BodyIsString = Outbound["body"] extends string ? true : never;
declare const bodyIsString: BodyIsString;
export { bodyIsString };
