import asyncio
import json
from pathlib import Path

from .phrase_extractor import PhraseExtractor
from .python_runtime import find_python


class PhraseAnalysis:
    """Use spaCy on the bundled Python ABI when available."""

    def __init__(self, plugin_dir):
        self.plugin_dir = plugin_dir
        self.module_dir = Path(plugin_dir) / "bin" / "py_modules"
        self.use_worker = (self.module_dir / "spacy").is_dir()
        self.lock = asyncio.Lock()
        self.worker = None
        self.fallback = None

    def _extract_locally(self, texts):
        if self.fallback is None:
            self.fallback = PhraseExtractor()
        return [self.fallback.extract(text) for text in texts]

    async def extract(self, texts):
        async with self.lock:
            if self.use_worker:
                try:
                    if self.worker is None:
                        python = await asyncio.to_thread(find_python, self.plugin_dir)
                        if python is None:
                            raise RuntimeError("No bundled Python available")
                        self.worker = await asyncio.create_subprocess_exec(
                            python, "-S", str(Path(__file__).with_name("phrase_extractor.py")), str(self.module_dir),
                            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, limit=4 * 1024 * 1024,
                        )
                    return await asyncio.wait_for(self._request(texts), timeout=8)
                except (OSError, ValueError, RuntimeError, TimeoutError):
                    await self._stop_worker()
                    self.use_worker = False
            return await asyncio.to_thread(self._extract_locally, texts)

    async def _request(self, texts):
        self.worker.stdin.write((json.dumps(texts) + "\n").encode())
        await self.worker.stdin.drain()
        return json.loads(await self.worker.stdout.readline())

    async def _stop_worker(self):
        if self.worker is not None:
            if self.worker.returncode is None:
                try:
                    self.worker.kill()
                except ProcessLookupError:
                    pass
            await self.worker.wait()
            self.worker = None

    async def close(self):
        async with self.lock:
            await self._stop_worker()
