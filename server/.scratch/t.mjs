import { parseJSON } from '../src/study/_shared.js';
const cases = [
  ['clean', '{"a":1,"b":[1,2]}'],
  ['fenced', '```json\n{"a":"x"}\n```'],
  ['trunc-in-string', '{"title":"ML","fiveMark":[{"question":"Q1","answer":"long ans"},{"question":"Q2","answer":"cut off here'],
  ['trunc-after-comma', '{"title":"ML","fiveMark":[{"question":"Q1","answer":"a"},'],
  ['trunc-dangling-key', '{"title":"ML","fiveMark":[{"question":"Q1","answer":"a"}],"onePage":'],
  ['trunc-nested', '{"t":"x","tenMark":[{"question":"Q1","subtopics":["a","b"],"answer":"partial te'],
  ['prose-prefix', 'Here you go:\n{"a":[1,2,3]}'],
  ['trunc-num', '{"a":[1,2,3'],
];
for (const [name, raw] of cases) {
  try { const r = parseJSON(raw); console.log('OK  ', name, '->', JSON.stringify(r).slice(0,120)); }
  catch (e) { console.log('FAIL', name, '->', e.message); }
}
