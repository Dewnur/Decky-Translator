import asyncio
from typing import List

import requests

from .base import ApiKeyError, NetworkError, ProviderType, RateLimitError, TranslationProvider


class YandexTranslateProvider(TranslationProvider):
    BASE_URL = "https://translate.api.cloud.yandex.net/translate/v2"
    MAX_CHARACTERS = 10_000
    MAX_TEXTS = 50
    LANGUAGES = (
        "ar", "bg", "zh-CN", "hr", "cs", "da", "nl", "en", "fi", "fr", "de",
        "el", "hi", "hu", "it", "ja", "ko", "no", "pl", "pt", "ro", "ru",
        "es", "sv", "th", "tr", "uk", "vi",
    )

    def __init__(self, api_key: str, folder_id: str):
        self._api_key = api_key
        self._folder_id = folder_id

    @property
    def name(self) -> str:
        return "Yandex Cloud Translate"

    @property
    def provider_type(self) -> ProviderType:
        return ProviderType.YANDEX

    def is_available(self, source_lang: str, target_lang: str) -> bool:
        return bool(self._api_key) and target_lang != "zh-TW"

    def get_supported_languages(self) -> List[str]:
        return list(self.LANGUAGES)

    def _request(self, method: str, body: dict, timeout: float) -> dict:
        if not self._api_key:
            raise ApiKeyError("Add a Yandex Cloud API key in Translation settings.")
        if not self._api_key.isascii():
            raise ApiKeyError("Yandex Cloud API keys contain only ASCII characters.")
        if self._folder_id:
            body = {**body, "folderId": self._folder_id}
        try:
            response = requests.post(
                f"{self.BASE_URL}/{method}",
                headers={"Authorization": f"Api-Key {self._api_key}"},
                json=body,
                timeout=timeout,
                allow_redirects=False,
            )
        except requests.Timeout:
            raise NetworkError("Yandex Cloud Translate timed out.") from None
        except requests.RequestException:
            raise NetworkError("Could not connect to Yandex Cloud Translate.") from None

        status = response.status_code
        if status == 401:
            raise ApiKeyError("Yandex Cloud rejected the API key.")
        if status == 403:
            raise ApiKeyError("Check the Yandex Cloud folder, service account role, and API key scope.")
        if status == 402:
            raise ApiKeyError("Enable billing for the Yandex Cloud folder.")
        if status == 429:
            raise RateLimitError("Yandex Cloud Translate quota or rate limit reached.")
        if status == 400:
            raise NetworkError("Yandex Cloud Translate rejected the request. Check the folder ID and language settings.")
        if status != 200:
            raise NetworkError(f"Yandex Cloud Translate returned HTTP {status}.")

        try:
            payload = response.json()
        except ValueError:
            raise NetworkError("Yandex Cloud Translate returned invalid JSON.") from None
        if not isinstance(payload, dict):
            raise NetworkError("Yandex Cloud Translate returned an unexpected response.")
        return payload

    def _translate_content(self, texts: List[str], source_lang: str, target_lang: str) -> List[str]:
        results = [text if not text.strip() else "" for text in texts]
        batch = []
        characters = 0

        def submit_batch():
            body = {
                "targetLanguageCode": "zh" if target_lang == "zh-CN" else target_lang,
                "format": "PLAIN_TEXT",
                "texts": [part for _, part in batch],
            }
            if source_lang and source_lang != "auto":
                body["sourceLanguageCode"] = "zh" if source_lang in ("zh-CN", "zh-TW") else source_lang
            translations = self._request("translate", body, timeout=10).get("translations")
            if not isinstance(translations, list) or len(translations) != len(batch):
                raise NetworkError("Yandex Cloud Translate returned an unexpected number of translations.")
            for (index, _), translation in zip(batch, translations):
                if not isinstance(translation, dict) or not isinstance(translation.get("text"), str):
                    raise NetworkError("Yandex Cloud Translate returned a translation without text.")
                translated = translation["text"]
                results[index] = " ".join(filter(None, (results[index], translated)))

        for index, text in enumerate(texts):
            if not text.strip():
                continue
            remaining = text
            while remaining:
                if len(remaining) <= self.MAX_CHARACTERS:
                    part, remaining = remaining, ""
                else:
                    cut = remaining.rfind(" ", self.MAX_CHARACTERS // 2, self.MAX_CHARACTERS + 1)
                    cut = self.MAX_CHARACTERS if cut == -1 else cut
                    part, remaining = remaining[:cut], remaining[cut:].lstrip()
                if len(batch) == self.MAX_TEXTS or characters + len(part) > self.MAX_CHARACTERS:
                    submit_batch()
                    batch = []
                    characters = 0
                batch.append((index, part))
                characters += len(part)

        if batch:
            submit_batch()
        return results

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        return (await self.translate_batch([text], source_lang, target_lang))[0]

    async def translate_batch(self, texts: List[str], source_lang: str, target_lang: str) -> List[str]:
        return await asyncio.to_thread(self._translate_content, texts, source_lang, target_lang)

    async def test_network(self) -> tuple[bool, str]:
        try:
            payload = await asyncio.to_thread(self._request, "languages", {}, 4)
            if not payload.get("languages"):
                return False, "Yandex Cloud Translate returned no languages."
            return True, ""
        except (ApiKeyError, NetworkError, RateLimitError) as error:
            return False, str(error)
