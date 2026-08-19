// Every place the console names itself reads from here, so the pending
// rename is a single edit rather than a sweep through the components.
export const identity = {
  name: 'DRAGON',
  greeting: 'WELCOME TO',
  tagline: 'the AI operating engine',
  surface: 'operating console'
} as const;
