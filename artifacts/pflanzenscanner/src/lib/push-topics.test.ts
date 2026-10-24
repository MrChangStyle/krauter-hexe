import { describe, expect, it } from "vitest";
import { PushTopic } from "@workspace/api-client-react";
import { PUSH_TOPICS } from "@/lib/push-topics";

describe("Benachrichtigungen", () => {
  it("offers a switch for every push topic the server knows", () => {
    expect(PUSH_TOPICS.map((t) => t.topic).sort()).toEqual(Object.values(PushTopic).sort());
  });
});
