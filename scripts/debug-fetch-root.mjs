const url = process.argv[2] ?? 'http://127.0.0.1:5174/';

try {
  const res = await fetch(url);
  const text = await res.text();
  console.log(`status=${res.status}`);
  console.log(text.slice(0, 8000));
} catch (err) {
  console.error(err);
  process.exit(1);
}
