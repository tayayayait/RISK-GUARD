/**
 * 런타임 환경변수 읽기.
 *
 * Edge Function 은 Deno 에서 돌고 테스트는 Node(vitest) 에서 돈다.
 * 두 런타임의 전역을 `globalThis` 캐스팅으로 접근하는 이유는,
 * `declare const Deno` 로 전역을 다시 선언하면 실제 Deno 네임스페이스를 가려
 * `deno check` 가 깨지고, 반대로 선언을 지우면 브라우저용 tsconfig 에서
 * `Cannot find name 'Deno'` 가 나기 때문이다. 캐스팅은 양쪽 모두에서 통과한다.
 */

interface DenoEnvLike {
  get(key: string): string | undefined;
}

function readDenoEnv(names: string[]): string | null {
  const denoEnv = (globalThis as { Deno?: { env?: DenoEnvLike } }).Deno?.env;
  if (!denoEnv) return null;
  try {
    for (const name of names) {
      const value = denoEnv.get(name);
      if (value) return value;
    }
  } catch {
    // 권한 없이 실행된 경우 등 — Node 폴백으로 넘어간다.
  }
  return null;
}

function readProcessEnv(names: string[]): string | null {
  const procEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (!procEnv) return null;
  for (const name of names) {
    const value = procEnv[name];
    if (value) return value;
  }
  return null;
}

/** 주어진 이름들을 순서대로 찾아 첫 번째로 값이 있는 것을 돌려준다. 없으면 빈 문자열. */
export function readEnv(...names: string[]): string {
  return readDenoEnv(names) ?? readProcessEnv(names) ?? "";
}
