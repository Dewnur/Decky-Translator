const BATCH_SIZE = 32;

export function translateStudyTexts(
    cache: Map<string, Promise<string>>,
    targetLanguage: string,
    texts: readonly string[],
    request: (texts: string[]) => Promise<string[]>,
): Promise<string[]> {
    const keyFor = (text: string) => JSON.stringify([targetLanguage, text]);
    const missing = [...new Set(texts)].filter(text => !cache.has(keyFor(text)));
    let previous: Promise<unknown> = Promise.resolve();

    for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
        const sources = missing.slice(offset, offset + BATCH_SIZE);
        const batch = previous.then(() => request(sources));
        previous = batch;

        sources.forEach((text, index) => {
            const key = keyFor(text);
            const pending = batch.then(
                translations => {
                    const translated = translations[index] ?? "";
                    if (!translated || translated === text.trim()) cache.delete(key);
                    return translated;
                },
                error => {
                    cache.delete(key);
                    throw error;
                },
            );
            cache.set(key, pending);
        });
    }

    return Promise.all(texts.map(text => cache.get(keyFor(text))!));
}
