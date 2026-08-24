import type {Item} from './console.js';

// A recorded session, played on a clock. There is no engine here and this is
// not a step toward one — it exists so the console can be watched doing the
// thing it is for: a call in flight, a failure, output longer than the window,
// a run of actions, and the view following all of it.
//
// Run it with DEMO=1. Nothing imports it otherwise.

type Step = {wait: number; change: (items: Item[]) => Item[]};

let seq = 0;
const id = () => `i${seq++}`;

const add = (item: Item) => (items: Item[]) => [...items, item];

/** Finish the last action, whatever it was. */
const settle = (state: 'ok' | 'failed', output: string[] = []) => (items: Item[]) => {
  const at = items.map(i => i.kind === 'did' && i.state === 'running').lastIndexOf(true);
  if (at < 0) return items;
  const copy = [...items];
  copy[at] = {...(copy[at] as Extract<Item, {kind: 'did'}>), state, output};
  return copy;
};

const doing = (verb: string, object: string) =>
  add({kind: 'did', id: id(), verb, object, state: 'running', output: []});

const TRACEBACK = [
  'Traceback (most recent call last):',
  '  File "src/extract_links.py", line 7, in <module>',
  '    import requests',
  "ModuleNotFoundError: No module named 'requests'"
];

const TEST_OUTPUT = [
  '============================= test session starts ==============================',
  'platform linux -- Python 3.11.9, pytest-8.2.0, pluggy-1.5.0',
  'rootdir: /home/spark/work',
  'collected 14 items',
  '',
  'tests/test_extract.py ......F.....F                                       [ 92%]',
  'tests/test_follow.py .                                                    [100%]',
  '',
  '=================================== FAILURES ===================================',
  '_________________________ test_relative_url_resolution _________________________',
  '',
  '    def test_relative_url_resolution():',
  '        page = "https://example.com/docs/index.html"',
  '        assert resolve(page, "../about") == "https://example.com/about"',
  'E       AssertionError: assert \'https://example.com/docs/about\' == \'https://example.com/about\'',
  'E         - https://example.com/about',
  'E         + https://example.com/docs/about',
  'E         ?                     +++++',
  '',
  'tests/test_extract.py:41: AssertionError',
  '____________________________ test_fragment_stripped ____________________________',
  '',
  '    def test_fragment_stripped():',
  '        assert strip("https://example.com/a#top") == "https://example.com/a"',
  'E       AssertionError',
  '',
  'tests/test_extract.py:58: AssertionError',
  '=========================== short test summary info ============================',
  'FAILED tests/test_extract.py::test_relative_url_resolution',
  'FAILED tests/test_extract.py::test_fragment_stripped',
  '========================= 2 failed, 12 passed in 0.44s ========================='
];

export const SESSION: Step[] = [
  {wait: 400, change: add({kind: 'said', id: id(), text: 'build a tool that extracts every link from a webpage, follows the redirects, and writes the final URLs to a csv'})},
  {wait: 900, change: add({kind: 'spoke', id: id(), text: 'I will write a small script, run it against a page, and check the output before calling it done.'})},
  {wait: 500, change: add({kind: 'noted', id: id(), lines: ['target: static HTML plus redirected documents', 'risks: duplicate links, fragments, relative URLs']})},

  {wait: 700, change: doing('write_file', 'src/extract_links.py')},
  {wait: 600, change: settle('ok')},

  {wait: 300, change: doing('bash', 'python3 src/extract_links.py https://example.com')},
  {wait: 1400, change: settle('failed', TRACEBACK)},

  {wait: 500, change: add({kind: 'noted', id: id(), lines: ['attempt 2 of 3 — missing dependency']})},

  {wait: 400, change: doing('bash', 'pip install requests')},
  {wait: 2100, change: settle('ok', ['Collecting requests', '  Downloading requests-2.32.3-py3-none-any.whl (64 kB)', 'Successfully installed requests-2.32.3'])},

  {wait: 300, change: doing('bash', 'python3 src/extract_links.py https://example.com')},
  {wait: 1200, change: settle('ok', ['wrote 47 rows to links.csv'])},

  {wait: 400, change: doing('web', 'relative URL resolution in python urllib')},
  {wait: 900, change: settle('ok', ['3 results'])},

  {wait: 300, change: doing('read_file', 'src/extract_links.py')},
  {wait: 400, change: settle('ok')},
  {wait: 200, change: doing('write_file', 'src/extract_links.py')},
  {wait: 500, change: settle('ok', ['142 lines → 151 lines'])},
  {wait: 200, change: doing('write_file', 'tests/test_extract.py')},
  {wait: 500, change: settle('ok')},

  {wait: 300, change: doing('run_tests', 'pytest -q')},
  {wait: 2200, change: settle('failed', TEST_OUTPUT)},

  {wait: 800, change: add({kind: 'spoke', id: id(), text: 'Two tests disagree with the resolver: a relative "../" is being joined against the document rather than its directory, and fragments are kept. Both are in resolve().'})},
  {wait: 600, change: doing('write_file', 'src/extract_links.py')},
  {wait: 600, change: settle('ok', ['151 lines → 149 lines'])},
  {wait: 300, change: doing('run_tests', 'pytest -q')},
  {wait: 1600, change: settle('ok', ['14 passed in 0.39s'])},
  {wait: 700, change: add({kind: 'spoke', id: id(), text: 'Done. 47 links found, 12 of them redirected; the final URLs are in links.csv.'})}
];

/** Play it. Returns a stop function, so quitting mid-session leaves nothing running. */
export function playDemo(apply: (change: (items: Item[]) => Item[]) => void): () => void {
  let timer: NodeJS.Timeout | undefined;
  let index = 0;
  const next = () => {
    const step = SESSION[index++];
    if (!step) return;
    timer = setTimeout(() => {
      apply(step.change);
      next();
    }, step.wait);
    timer.unref();
  };
  next();
  return () => timer && clearTimeout(timer);
}
