/** Pauses execution for the given number of milliseconds. Used to respect Gemini rate limits. */
export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))
