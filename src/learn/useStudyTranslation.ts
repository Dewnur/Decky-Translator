import { useEffect, useState } from "react";

type Translation =
    | { status: "loading" }
    | { status: "ready"; text: string }
    | { status: "error"; message: string };

export function useStudyTranslation(
    source: string | null,
    request: (text: string) => Promise<string>,
    delay: number,
) {
    const [result, setResult] = useState<{ source: string; value: Translation }>();
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (source === null) return;

        let active = true;
        setResult({ source, value: { status: "loading" } });
        const timer = setTimeout(async () => {
            try {
                const text = await request(source);
                if (active) setResult({ source, value: { status: "ready", text } });
            } catch (error) {
                if (!active) return;
                const message = error instanceof Error ? error.message : "Translation failed.";
                setResult({ source, value: { status: "error", message } });
            }
        }, delay);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [source, request, delay, attempt]);

    const value: Translation = result?.source === source ? result.value : { status: "loading" };
    return { value, retry: () => setAttempt(previous => previous + 1) };
}
