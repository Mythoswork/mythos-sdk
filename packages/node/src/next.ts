import type { Mythos } from './mythos';
import { toNodeHandler } from './node-http';

export const pagesHandler = (mythos: Mythos) => toNodeHandler(mythos);
