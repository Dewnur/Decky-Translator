import unittest

from phrase_extractor import PhraseExtractor


class TestPhraseExtractor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.extractor = PhraseExtractor()

    def assert_phrases(self, source, expected):
        result = self.extractor.extract(source)
        self.assertEqual(result["text"], source)
        self.assertEqual(
            [(item["surface"], item["canonical"]) for item in result["phrases"]],
            expected,
        )
        for item in result["phrases"]:
            self.assertEqual(source[item["start"]:item["end"]], item["surface"])
            self.assertTrue(item["translation"])

    def test_examples_and_inflections(self):
        self.assert_phrases("I wouldn't count on him showing up.", [
            ("count on", "count on"), ("showing up", "show up"),
        ])
        self.assert_phrases("I need to figure this out before giving up.", [
            ("figure this out", "figure out"), ("giving up", "give up"),
        ])
        self.assert_phrases("👋 He showed up and counted on me.", [
            ("showed up", "show up"), ("counted on", "count on"),
        ])

    def test_prioritizes_long_matches_and_limits_to_two(self):
        self.assert_phrases("I figured it out, then we came up with a plan and gave up.", [
            ("figured it out", "figure out"), ("came up with", "come up with"),
        ])

    def test_skips_literal_collocations(self):
        for source in (
            "I looked up at the sky.",
            "We go to the store every week.",
            "She sat on the ground in front of her house.",
            "The rumbles made it difficult to keep our footing.",
        ):
            with self.subTest(source=source):
                self.assert_phrases(source, [])

    def test_normalized_matches_reuse_cache_with_new_offsets(self):
        self.assert_phrases("She FIGURED IT OUT.", [("FIGURED IT OUT", "figure out")])
        before = self.extractor._cached_matches.cache_info().hits
        self.assert_phrases("She figured  it\nout.", [("figured  it\nout", "figure out")])
        self.assertEqual(self.extractor._cached_matches.cache_info().hits, before + 1)
