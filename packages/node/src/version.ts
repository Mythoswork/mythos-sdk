import { createRequire } from 'module';

const nodeRequire = createRequire(__filename);

export const SDK_VERSION: string = nodeRequire('../package.json').version;
