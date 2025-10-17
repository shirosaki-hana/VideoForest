import { fileURLToPath } from 'url';
import path from 'path';
//------------------------------------------------------------------------------//
const __filename: string = fileURLToPath(import.meta.url);
export const __dirname: string = path.dirname(__filename);
export const backendRoot: string = path.join(__dirname, '../');
export const projectRoot: string = path.join(backendRoot, '../');
