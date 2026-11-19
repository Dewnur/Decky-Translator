import argparse
import json
from pathlib import Path
import re
import sqlite3
import unicodedata

parser = argparse.ArgumentParser(description="Build the WikDict/Kaikki phrase selection shipped with Tutor.")
parser.add_argument("wikdict", type=Path, help="WikDict's en-ru.sqlite3 export")
parser.add_argument("idioms", type=Path, help="Kaikki English idiomatic JSONL")
parser.add_argument("phrasal_verbs", type=Path, help="WithEnglishWeCan phrasal.verbs.build.json")
parser.add_argument("--output", type=Path, default=Path("py_modules/providers/phrases-en-ru.tsv"))
args = parser.parse_args()
phrasal = set(json.loads(args.phrasal_verbs.read_text(encoding="utf-8")))
idiomatic = {}
pattern = re.compile(r'[a-z]+(?: [a-z]+){1,6}')
specific = {}
for line in args.idioms.open(encoding="utf-8"):
    record = json.loads(line)
    word = record['word']
    if not pattern.fullmatch(word):
        continue
    idioms = [sense for sense in record['senses'] if 'idiomatic' in sense.get('tags', [])]
    if not idioms:
        continue
    if word not in idiomatic or record['pos'] == 'verb':
        idiomatic[word] = record['pos']
    for sense in idioms:
        russian = [t['word'] for t in sense.get('translations', []) if t.get('code') == 'ru' and 'word' in t]
        if russian:
            specific.setdefault(word, []).extend(russian)

overrides = {
    'count on': ('phrasal', 'рассчитывать на'),
    'figure out': ('phrasal', 'разобраться'),
    'give up': ('phrasal', 'сдаваться'),
    'show up': ('phrasal', 'появляться'),
    'hold on': ('phrasal', 'подождать'),
    'hang in there': ('idiom', 'держись'),
    'piece of cake': ('idiom', 'проще простого'),
    'in a nutshell': ('idiom', 'в двух словах'),
    'keep an eye on': ('verbal_idiom', 'присматривать за'),
    'once in a blue moon': ('idiom', 'крайне редко'),
    'no way': ('idiom', 'ни за что'),
    'never mind': ('idiom', 'ничего, забудь'),
    'by the way': ('idiom', 'кстати'),
    'as far as i know': ('idiom', 'насколько я знаю'),
    'no matter what': ('idiom', 'что бы ни случилось'),
    'a long shot': ('idiom', 'маловероятное дело'),
    'come up with': ('phrasal', 'придумать'),
    'out of the blue': ('idiom', 'совершенно неожиданно'),
    'walk it off': ('idiom', 'пройдись, станет легче'),
    'call it a day': ('verbal_idiom', 'закончить на сегодня'),
}
deny = set('''act as|act like|add to|agree with|agree to|ask about|ask for|at all|at first|at home|at the same time|
be able to|be about to|be after|be against|be at|be back|be down|be for|be in|be off|be on|be over|be up|
belong to|believe in|bite into|break into|bring to|build on|buy for|call for|care about|care for|come after|come along|
come back|come down|come from|come in|come out|come over|come to|come up|come with|compare to|consist of|cover with|
cut through|deal in|depend on|dig into|do for|do with|dress in|drive by|eat at|enter into|fall from|fall in|fall on|
feed on|fill with|find in|fit into|fly over|follow up on|for example|for the first time|from time to time|get at|get back|
get down|get in|get off|get on|get out|get over|get to|get up|go after|go along|go around|go back|go by|go down|go for|
go in|go into|go out|go over|go through|go to|go under|go up|go with|grow in|have on|hear about|hear from|help with|
hit on|hold in|hold onto|hope for|hot water|in fact|in front of|in order to|in other words|inside out|keep in|keep on|
keep to|leave for|leave with|let in|let out|little girl|live in|live on|look about|look at|look for|look into|look like|
look out of|look through|look to|lose to|make for|move back|move in|move out|move to|near to|need for|on and off|on top of|
out of|owe to|pay for|pick at|place in|play for|play in|point at|pour into|press on|pull on|push against|put in|
put on|put to|read about|read in|read into|refer to|rely on|return to|ride on|right now|rise above|run across|run around|
run down|run off|run on|run out of|run past|see in|sell to|send to|set in|set on|show around|sit beside|sit down|sit in|
sit on|sit up|sleep in|speak about|speak to|speak with|stand by|stand in|stand on|stand up|start from|stay at|stay in|
stay on|step in|step into|step on|stick in|stick on|stop at|stop by|struggle with|take from|take in|take to|talk about|
talk of|talk to|tell about|think about|think of|throw at|throw into|to be|to go|to the left|to the right|turn around|
turn to|up to|use for|wait for|walk across|walk away|walk in|walk into|walk off|walk out|walk through|watch for|work at|
work for|work in|work on|work with|write about|write to|you know|all the way|one by one|right away|once again|on the other hand|
piece of paper|head of state|body language|red light|green light|in the middle of|in the morning|in the world|at the end|
first thing|same thing|the other day|twice a day|do the same|from the beginning|for a while|take a look|so far|so long|
with the exception of|as well as|as well|as soon as|how long|how much|where is|what is|and so on|on the way|sink in|go off on|
by default|in the meantime|in addition to|take a seat'''.replace('\n','').split('|'))
deny.update({'back of the net','catch a cold','drop like a stone','put in a full day','fire in the hole','head of the family','lost in thought', 'as if', 'look down on', 'tell the truth', 'all rights reserved',
             'about to', 'and change', 'like that', 'one thing', 'going to', 'not just'})

link = re.compile(r'\[\[(?:[^\]|]+\|)?([^\]]+)\]\]')
def russian(text):
    text = link.sub(r'\1', text)
    text = re.sub(r"/lit:[^/]+/", "", text)
    text = unicodedata.normalize("NFC", text.replace("\u0301", ""))
    text = re.sub(r'\s+', ' ', text).strip(' ;,')
    return text if re.search('[а-яё]', text, re.I) and not any(c in text for c in '[]{}<>') else ""

db = sqlite3.connect(args.wikdict.resolve().as_uri() + "?mode=ro", uri=True)
entries = {}
for phrase, translations, _ in db.execute("select written_rep, trans_list, rel_importance from simple_translation where max_score >= 50 order by rel_importance desc, written_rep"):
    if phrase in deny or phrase in overrides or not pattern.fullmatch(phrase):
        continue
    if phrase in phrasal:
        if phrase.startswith(("be ", "do ", "have ")) and len(phrase.split()) < 3:
            continue
        kind = "phrasal"
    elif (pos := idiomatic.get(phrase)):
        if len(phrase.split()) < 3 and pos in {"noun", "adj", "adv", "prep_phrase"}:
            continue
        kind = "verbal_idiom" if pos == "verb" else "idiom"
    else:
        continue

    # Prefer translations tied to an idiomatic sense, then the scored WikDict glosses.
    options = specific.get(phrase, []) + link.sub(r'\1', translations).split(' | ')
    cleaned = list(dict.fromkeys(filter(None, map(russian, options))))
    if not cleaned:
        continue
    entries[phrase] = (kind, ' / '.join(cleaned[:2]))
    if len(entries) == 1050 - len(overrides):
        break
entries.update(overrides)
assert len(entries) == 1050, len(entries)
out = args.output
header = "# English phrase / type / Russian gloss. Data: CC BY-SA 4.0. See THIRD_PARTY_LICENSES.\n"
out.write_text(header + "\n".join("\t".join((phrase, *meta)) for phrase, meta in sorted(entries.items())) + "\n", encoding="utf-8")
print(len(entries), out.stat().st_size)
