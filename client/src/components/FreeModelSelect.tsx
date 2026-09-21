import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

// ═══════════════════════════════════════════════════════════
// 免費模型下拉選單（共用）
// ═══════════════════════════════════════════════════════════

/** Select 哨兵值：代表「使用後端預設模型」（不傳 model 給後端） */
export const DEFAULT_MODEL_VALUE = "__default__";
const MODEL_STORAGE_KEY = "ai-analysis-model";

/** 內建免費模型清單（OpenRouter :free 系列）：動態清單載入失敗/為空時的 fallback */
export const FALLBACK_FREE_MODELS: { id: string; name: string }[] = [
  { id: "deepseek/deepseek-chat-v3.1:free", name: "DeepSeek V3.1" },
  { id: "deepseek/deepseek-r1-0528:free", name: "DeepSeek R1（推理）" },
  { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash" },
  { id: "qwen/qwen3-235b-a22b:free", name: "Qwen3 235B" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B" },
  { id: "mistralai/mistral-small-3.2-24b-instruct:free", name: "Mistral Small 3.2" },
  { id: "openai/gpt-oss-20b:free", name: "GPT-OSS 20B" },
];

/**
 * 免費模型選擇 hook：回傳目前選擇（哨兵值 DEFAULT_MODEL_VALUE 代表後端預設）
 * 與更新函式；選擇結果寫入 localStorage，各頁面（個股追蹤/宏觀儀表板）共用同一偏好。
 */
export function useFreeModelSelection() {
  const [modelValue, setModelValue] = useState<string>(() => {
    try {
      return window.localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL_VALUE;
    } catch {
      return DEFAULT_MODEL_VALUE;
    }
  });
  const handleModelChange = (v: string) => {
    setModelValue(v);
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, v);
    } catch {
      /* localStorage 不可用時忽略 */
    }
  };
  return { modelValue, handleModelChange };
}

interface FreeModelSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  disabled?: boolean;
}

/** 免費模型下拉選單：動態載入（後端 10 分鐘快取），失敗/為空時用內建 fallback */
export function FreeModelSelect({ value, onValueChange, disabled }: FreeModelSelectProps) {
  const { data: freeModelsData } = trpc.analysis.listFreeModels.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const modelOptions = useMemo(() => {
    const dynamic = (freeModelsData ?? []) as { id: string; name: string }[];
    const seen = new Set<string>();
    return [...dynamic, ...FALLBACK_FREE_MODELS].filter((m) => {
      if (!m?.id || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [freeModelsData]);

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        size="sm"
        className="w-[180px] text-xs"
        title="選擇 AI 分析使用的免費模型"
      >
        <SelectValue placeholder="選擇免費模型" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_MODEL_VALUE} className="text-xs">
          預設模型（後端設定）
        </SelectItem>
        {modelOptions.length > 0 && (
          <>
            <SelectSeparator />
            {modelOptions.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.name}
              </SelectItem>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  );
}