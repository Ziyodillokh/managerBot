import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  config({ path: envPath });
}
