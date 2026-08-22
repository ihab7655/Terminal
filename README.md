# Dragon Console Prototype

Standalone visual prototype for the AI Operating Engine console.

This project intentionally uses only fake data. It does not connect to, inspect,
or depend on any engine architecture.

## Sizing

Every screen tracks the terminal it is drawn into. Resize or zoom the window and
the frame follows: wider means longer lines, narrower means they wrap, and no
line is ever drawn past the right edge — the program owns its own wrapping so
the terminal never has to, because a terminal that wraps a full screen frame
makes it scroll and judder.

On a window too small for everything, screens shed rather than overflow. The
welcome page drops its tagline, then its gaps, then the dragon's tail; the
console drops its subtitle, then its launcher hint, then transcript rows; the
launcher lists fewer surfaces, drops its contextual view, and on a very small
window does not open at all.

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
