/** Relative take file paths (data-model.md § File layout). Pure, so repositories can use it in tests. */
const TAKE_ID = /^[0-9A-Za-z_-]+$/;

export function relTakePaths(id: string) {
  if (!TAKE_ID.test(id)) throw new Error(`Invalid take id: ${JSON.stringify(id)}`);
  const dir = `takes/${id}`;
  return { dir, video: `${dir}/video.mp4`, landmarks: `${dir}/landmarks.jsonl`, thumb: `${dir}/thumb.jpg` };
}
