import { niceDate, niceTime } from "$sb/lib/dates.ts";

export function handlebarHelpers() {
  return {
    json: (v: any) => JSON.stringify(v),
    niceDate: (ts: any) => niceDate(new Date(ts)),
    escapeRegexp: (ts: any) => {
      return ts.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    },
    replaceRegexp: (s: string, regexp: string, replacement: string) => {
      return s.replace(new RegExp(regexp, "g"), replacement);
    },
    prefixLines: (v: string, prefix: string) =>
      v.split("\n").map((l) => prefix + l).join("\n"),
    substring: (s: string, from: number, to: number, elipsis = "") =>
      s.length > to - from ? s.substring(from, to) + elipsis : s,

    time: () => niceTime(new Date()),
    today: () => niceDate(new Date()),
    tomorrow: () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return niceDate(tomorrow);
    },
    yesterday: () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return niceDate(yesterday);
    },
    lastWeek: () => {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      return niceDate(lastWeek);
    },
    nextWeek: () => {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      return niceDate(nextWeek);
    },
  };
}
