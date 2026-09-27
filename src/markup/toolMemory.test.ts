import { beforeEach, describe, expect, it } from "vitest";
import { restoreToolMemory, snapshotToolMemory } from "./toolMemory";
import { useToolStore } from "./toolStore";

const initial = useToolStore.getState();

describe("tool memory", () => {
  beforeEach(() => useToolStore.setState(initial, true));

  it("round-trips through JSON", () => {
    useToolStore.setState({
      sharedColor: "#1e88e5",
      widths: { pen: 6, highlighter: 24 },
      fills: { rect: "both" },
      fillColors: { rect: "#ffffff" },
      arrowEnds: "both",
      fontFamily: "Consolas",
      fontSize: 36,
      textBold: true,
      textBackground: true,
    });
    const saved = JSON.stringify(snapshotToolMemory());
    useToolStore.setState(initial, true);
    restoreToolMemory(JSON.parse(saved));
    expect(snapshotToolMemory()).toEqual(JSON.parse(saved));
  });

  it("keeps what's valid from a damaged or foreign value", () => {
    restoreToolMemory({
      version: 1,
      sharedColor: "red",
      widths: { pen: 6, rocket: 3, line: -1 },
      fills: { rect: "sparkly" },
      arrowHead: "open",
      fontSize: "big",
      textAlign: "center",
    });
    const t = useToolStore.getState();
    expect(t.sharedColor).toBeNull();
    expect(t.widths).toEqual({ pen: 6 });
    expect(t.fills).toEqual({});
    expect(t.arrowHead).toBe("open");
    expect(t.fontSize).toBeNull();
    expect(t.textAlign).toBe("center");
  });

  it("ignores values from a newer version and non-objects", () => {
    restoreToolMemory({ version: 99, arrowHead: "open" });
    restoreToolMemory("nope");
    restoreToolMemory(null);
    expect(useToolStore.getState().arrowHead).toBe("filled");
  });
});
