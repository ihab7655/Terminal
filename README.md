# Dragon Console Prototype

Standalone visual prototype for the AI Operating Engine console.

This project intentionally uses only fake data. It does not connect to, inspect,
or depend on any engine architecture.

## Run

```bash
npm install
npm run dev
```

Controls:

- `Ctrl+K`: open launcher
- number keys or arrows: choose a launcher view
- `Escape`: close overlay
- composer: arrows move the caret, `Up`/`Down` recall history, `Enter` sends,
  `Ctrl+A`/`Ctrl+E` jump to the ends, `Ctrl+U` clears, `Ctrl+D` deletes forward
- `Ctrl+C`: quit
