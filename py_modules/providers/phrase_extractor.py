"""Model-free English phrase matching with offsets in the original string."""

from functools import lru_cache
from pathlib import Path
import re


DATA_PATH = Path(__file__).with_name("phrases-en-ru.tsv")
TOKEN = re.compile(r"[a-zA-Z]+(?:['’][a-zA-Z]+)?|[^\s]", re.UNICODE)
IRREGULAR = {
    "be": "am is are was were been being", "beat": "beat beaten beating",
    "bite": "bit bitten biting", "blow": "blew blown blowing", "break": "broke broken breaking",
    "bring": "brought bringing", "build": "built building", "buy": "bought buying",
    "catch": "caught catching", "come": "came coming", "cut": "cut cutting",
    "do": "does did done doing", "draw": "drew drawn drawing", "drink": "drank drunk drinking",
    "drive": "drove driven driving", "eat": "ate eaten eating", "fall": "fell fallen falling",
    "feel": "felt feeling", "fight": "fought fighting", "find": "found finding",
    "fly": "flew flown flying", "forget": "forgot forgotten forgetting",
    "get": "got gotten getting", "give": "gave given giving", "go": "goes went gone going",
    "grow": "grew grown growing", "hang": "hung hanging", "have": "has had having",
    "hear": "heard hearing", "hit": "hit hitting", "hold": "held holding",
    "keep": "kept keeping", "know": "knew known knowing", "lay": "laid laying",
    "lead": "led leading", "leave": "left leaving", "let": "let letting", "lie": "lay lain lying",
    "light": "lit lighting", "lose": "lost losing", "make": "made making",
    "meet": "met meeting", "pay": "paid paying", "put": "put putting",
    "read": "read reading", "ride": "rode ridden riding", "ring": "rang rung ringing",
    "rise": "rose risen rising", "run": "ran run running", "say": "said saying",
    "see": "saw seen seeing", "seek": "sought seeking", "sell": "sold selling",
    "send": "sent sending", "set": "set setting", "shake": "shook shaken shaking",
    "shoot": "shot shooting", "show": "showed shown showing", "shut": "shut shutting",
    "sing": "sang sung singing", "sit": "sat sitting", "sleep": "slept sleeping",
    "speak": "spoke spoken speaking", "spend": "spent spending", "stand": "stood standing",
    "steal": "stole stolen stealing", "stick": "stuck sticking", "strike": "struck striking",
    "swear": "swore sworn swearing", "take": "took taken taking", "teach": "taught teaching",
    "tear": "tore torn tearing", "tell": "told telling", "think": "thought thinking",
    "throw": "threw thrown throwing", "understand": "understood understanding",
    "wake": "woke woken waking", "wear": "wore worn wearing", "win": "won winning",
    "wind": "wound winding", "write": "wrote written writing",
}
DOUBLE_FINAL = frozenset("beg ban dip drag drop drum fit flip grab hop hug map nod pat pin plan pop rub scrub ship shop skip slip snap spot stop swap tap tip trip tug wrap".split())
SEPARABLE = frozenset({
    "bring up", "call off", "cross out", "figure out", "fill in", "fill out", "find out",
    "give away", "give back", "give up", "hand in", "hand over", "leave out", "let down",
    "look up", "make up", "pick up", "point out", "put aside", "put away", "put down",
    "put off", "put on", "rule out", "set up", "shut down", "sort out", "take apart",
    "take back", "take off", "take out", "tear down", "throw away", "try out", "turn down",
    "turn off", "turn on", "turn up", "wake up", "work out", "write down",
})
OBJECTS = "it this that them these those me you him her us".split()

# Restrict literal readings that can be recognized confidently without a statistical model.
LITERAL_CONTINUATIONS = {
    "look up": {"at", "into", "toward", "towards"},
    "look down": {"at", "into", "over", "toward", "towards", "the"},
    "look back": {"at", "toward", "towards"},
    "look around": set(OBJECTS) | {"at", "the", "a"},
    "make it": {"clear", "difficult", "easier", "easy", "hard", "harder", "impossible", "possible", "worse"},
    "come up": {"stairs", "the"},
    "go down": {"the", "a", "this", "that"},
    "go up": {"the", "a", "this", "that"},
}


def verb_forms(verb):
    if verb.endswith("y") and verb[-2:-1] not in "aeiou":
        third = verb[:-1] + "ies"
        past = verb[:-1] + "ied"
    else:
        third = verb + ("es" if verb.endswith(("s", "x", "z", "sh", "ch", "o")) else "s")
        past = verb + "d" if verb.endswith("e") else verb + "ed"
    stem = verb[:-1] if verb.endswith("e") and not verb.endswith(("ee", "ye")) else verb
    if verb in DOUBLE_FINAL:
        stem = verb + verb[-1]
        past = stem + "ed"
    present = verb[:-2] + "ying" if verb.endswith("ie") else stem + "ing"
    return {verb, third, *IRREGULAR.get(verb, f"{past} {present}").split()}


class PhraseExtractor:
    def __init__(self, use_spacy=False):
        self.entries = {}
        indexed_patterns = {}
        for line in DATA_PATH.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            canonical, kind, translation = line.split("\t")
            self.entries[canonical] = translation
            head, *tail = canonical.split()
            variants = [(head, *tail)]
            if kind in ("phrasal", "verbal_idiom"):
                variants = [(form, *tail) for form in verb_forms(head)]
                if canonical in SEPARABLE:
                    variants += [(form, pronoun, *tail) for form in verb_forms(head) for pronoun in OBJECTS]
            for variant in variants:
                indexed_patterns.setdefault(tuple(variant), set()).add(canonical)

        self.patterns = {words: next(iter(entries)) for words, entries in indexed_patterns.items() if len(entries) == 1}
        self.widths = sorted({len(words) for words in self.patterns}, reverse=True)
        self._cached_tokens = lru_cache(maxsize=512)(self._tokens)
        self._cached_matches = lru_cache(maxsize=2048)(self._resolve)
        self.nlp = None
        if use_spacy:
            from spacy import blank
            from spacy.matcher import Matcher

            self.nlp = blank("en")
            self.matcher = Matcher(self.nlp.vocab)
            self.matcher.add("PHRASE", [[{"LOWER": word} for word in words] for words in self.patterns])

    def _tokens(self, text):
        if self.nlp is not None:
            return [(token.text, token.idx, token.idx + len(token)) for token in self.nlp.make_doc(text) if not token.is_space]
        return [(item.group(), item.start(), item.end()) for item in TOKEN.finditer(text)]

    def _resolve(self, words):
        if self.nlp is not None:
            from spacy.tokens import Doc

            candidates = [(start, end, self.patterns[words[start:end]])
                          for _, start, end in self.matcher(Doc(self.nlp.vocab, words=list(words)))]
        else:
            candidates = []
            for start in range(len(words)):
                for width in self.widths:
                    end = start + width
                    if end <= len(words):
                        canonical = self.patterns.get(words[start:end])
                        if canonical:
                            candidates.append((start, end, canonical))
        candidates.sort(key=lambda result: (result[0] - result[1], result[0], result[2]))
        selected = []
        for start, end, canonical in candidates:
            if end < len(words) and words[end] in LITERAL_CONTINUATIONS.get(canonical, ()):
                continue
            if any(start < kept_end and end > kept_start for kept_start, kept_end, _ in selected):
                continue
            selected.append((start, end, canonical))
            if len(selected) == 2:
                break
        return tuple(sorted(selected))

    def extract(self, text):
        tokens = self._cached_tokens(text)
        words = tuple(token.casefold().replace("’", "'") for token, _, _ in tokens)
        phrases = []
        for first, last, canonical in self._cached_matches(words):
            start, end = tokens[first][1], tokens[last - 1][2]
            phrases.append({
                "start": start,
                "end": end,
                "surface": text[start:end],
                "canonical": canonical,
                "translation": self.entries[canonical],
            })
        return {"text": text, "phrases": phrases}


if __name__ == "__main__":
    import json
    import sys

    sys.path.insert(0, sys.argv[1])
    extractor = PhraseExtractor(use_spacy=True)
    for request in sys.stdin:
        texts = json.loads(request)
        print(json.dumps([extractor.extract(text) for text in texts]), flush=True)
