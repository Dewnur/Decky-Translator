import { useEffect, useState } from "react";

export type StudyTranslation<Value> =
    | { status: "loading" }
    | { status: "ready"; data: Value }
    | { status: "error"; message: string };

export function useStudyTranslation<Source, Value>(
    source: Source | null,
    request: (source: Source) => Promise<Value>,
    delay: number,
) {
    const [result, setResult] = useState<{
        source: Source;
        request: typeof request;
        attempt: number;
        value: StudyTranslation<Value>;
    }>();
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (source === null) return;

        let active = true;
        const timer = setTimeout(async () => {
            try {
                const data = await request(source);
                if (active) setResult({ source, request, attempt, value: { status: "ready", data } });
            } catch (error) {
                if (!active) return;
                const message = error instanceof Error ? error.message : "Translation failed.";
                setResult({ source, request, attempt, value: { status: "error", message } });
            }
        }, delay);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [source, request, delay, attempt]);

    const current = result && result.source === source && result.request === request && result.attempt === attempt;
    const value: StudyTranslation<Value> = current ? result.value : { status: "loading" };
    return { value, retry: () => setAttempt(previous => previous + 1) };
}
