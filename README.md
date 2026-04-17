# RISK-GUARD

RISK-GUARD는 작업 입력 -> AI 분석 확인 -> 분석 결과 -> 근거 탐색 -> 교육자료 선택 -> 보고서 출력의 6단계 데스크톱 워크플로우를 제공합니다.

## 개발

```bash
pnpm install
pnpm dev
```

### Vite 504 (`Outdated Optimize Dep`) 대응

```bash
Remove-Item -Recurse -Force node_modules/.vite
pnpm dev
```

`vite.config.ts`에서 `optimizeDeps.include`와 `optimizeDeps.force`를 설정해
`@radix-ui/react-checkbox` 관련 재최적화 충돌을 줄였습니다.

## 테스트/빌드

```bash
pnpm test
pnpm run build
```

현재 실행 환경에서는 `spawn EPERM` 제약으로 Vite/Vitest 실행이 실패할 수 있습니다.

코드 수정 후 권장 검증:

```bash
npm test
npm run build
```

## 환경 변수

```bash
cp .env.example .env.local
```

필수:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 문서

- XML 대비 구현 매트릭스: [`docs/xml-implementation-matrix.md`](/C:/Users/dbcdk/Desktop/RISK%20GUARD/docs/xml-implementation-matrix.md)
- API 계약: [`docs/api-contracts.md`](/C:/Users/dbcdk/Desktop/RISK%20GUARD/docs/api-contracts.md)
- Supabase Edge Function: [`docs/supabase-edge-functions.md`](/C:/Users/dbcdk/Desktop/RISK%20GUARD/docs/supabase-edge-functions.md)
- 외부 API 인벤토리: [`docs/external-api-inventory.md`](/C:/Users/dbcdk/Desktop/RISK%20GUARD/docs/external-api-inventory.md)
- 상태 전이: [`docs/state-machine.md`](/C:/Users/dbcdk/Desktop/RISK%20GUARD/docs/state-machine.md)
- 예외 처리: [`docs/exception-handling.md`](/C:/Users/dbcdk/Desktop/RISK%20GUARD/docs/exception-handling.md)

## Local Hooks (Boundary Guard)

Enable local hooks once per clone:

```bash
git config core.hooksPath .githooks
```

Branch prefixes:

- `feat/forms/*`
- `feat/assessment/*`
- `feat/prediction/*`
- `feat/shared/*`

Hook behavior:

- `pre-commit`: checks branch prefix and staged-file scope (`scripts/check-branch-scope.mjs`)
- `pre-push`: runs scoped tests by branch area (`scripts/run-scoped-tests.mjs`)
