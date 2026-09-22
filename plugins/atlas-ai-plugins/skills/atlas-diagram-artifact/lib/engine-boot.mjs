// Registered through NODE_OPTIONS so every node process the engine starts loads the hooks.
import { register } from 'node:module';

register('./engine-hooks.mjs', import.meta.url);
