import { describe, it, expect, vi } from "vitest";
import { streamLLMAnalysis, streamDetailedAnalysis } from "./llm-stream";
import * as llmModule from "./_core/llm";

// Mock invokeLLM 函數
vi.mock("./_core/llm", async () => {
  const actual = await vi.importActual("./_core/llm");
  return {
    ...actual,
    invokeLLM: vi.fn(async () => ({
      id: "test-id",
      created: Date.now(),
      model: "gpt-4o-mini",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "這是一個測試的分析結果。技術面顯示上升趨勢。基本面穩健。預測未來看漲。",
          },
          finish_reason: "stop",
        },
      ],
    })),
  };
});

describe("AI Stream Analysis", () => {
  it("should stream analysis chunks correctly", async () => {
    const chunks: string[] = [];

    for await (const chunk of streamLLMAnalysis(
      "You are a helpful assistant.",
      "What is 2+2?"
    )) {
      if (chunk.type === "text" && chunk.content) {
        chunks.push(chunk.content);
      }
    }

    // 應該至少收到一些文字內容
    const result = chunks.join("");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("測試");
    console.log("✓ Stream analysis result:", result);
  });

  it("should emit complete event after streaming", async () => {
    const events: string[] = [];

    for await (const chunk of streamLLMAnalysis(
      "System",
      "Test prompt"
    )) {
      events.push(chunk.type);
    }

    // 應該以 complete 事件結尾
    expect(events[events.length - 1]).toBe("complete");
    expect(events.some((e) => e === "text")).toBe(true);
  });

  it("should handle detailed analysis with sections", async () => {
    const sections: { title: string; content: string }[] = [];
    let currentSection: { title: string; content: string } | null = null;

    for await (const chunk of streamDetailedAnalysis("AAPL", 150.5, 155.0, 145.0)) {
      if (chunk.type === "section_start" && "title" in chunk) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          title: (chunk as any).title || "Unknown",
          content: "",
        };
      } else if (chunk.type === "section_end") {
        if (currentSection) {
          sections.push(currentSection);
          currentSection = null;
        }
      } else if (chunk.type === "text" && chunk.content && currentSection) {
        currentSection.content += chunk.content;
      }
    }

    // 應該至少有一個分析段落
    expect(sections.length).toBeGreaterThan(0);
    console.log(`✓ Generated ${sections.length} analysis sections`);

    // 每個段落應該有標題和內容
    sections.forEach((section) => {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.content.length).toBeGreaterThan(0);
      console.log(`  - ${section.title}: ${section.content.substring(0, 40)}...`);
    });
  });

  it("should include technical, fundamental, and forecast sections", async () => {
    const sectionTitles: string[] = [];

    for await (const chunk of streamDetailedAnalysis("AAPL", 150.5, 155.0, 145.0)) {
      if (chunk.type === "section_start" && "title" in chunk) {
        sectionTitles.push((chunk as any).title);
      }
    }

    // 應該包含三個分析段落
    expect(sectionTitles).toContain("技術面分析");
    expect(sectionTitles).toContain("基本面分析");
    expect(sectionTitles).toContain("未來走勢預測");
  });

  it("should handle streaming with correct chunk types", async () => {
    const chunkTypes: string[] = [];

    for await (const chunk of streamLLMAnalysis(
      "System",
      "Test"
    )) {
      chunkTypes.push(chunk.type);
    }

    // 應該只包含有效的 chunk 類型
    const validTypes = ["text", "complete", "error"];
    chunkTypes.forEach((type) => {
      expect(validTypes).toContain(type);
    });

    // 應該以 complete 或 error 結尾
    const lastType = chunkTypes[chunkTypes.length - 1];
    expect(["complete", "error"]).toContain(lastType);
  });
});
