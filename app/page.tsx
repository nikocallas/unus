import { FILENAMES } from '../lib/fixtures/corpus.ts';
import UnusApp from './UnusApp.tsx';

export default function Page() {
  return <UnusApp sampleFiles={Object.values(FILENAMES)} />;
}
