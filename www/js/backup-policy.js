export const WEEK_MS=7*24*60*60*1000;
export function backupDue(last,now=Date.now()){return !Number.isFinite(Number(last))||Number(last)<=0||now-Number(last)>=WEEK_MS;}
export async function commitBackup({load,write,checkpoint}){const data=await load();const path=await write(data);await checkpoint(path);return path;}
